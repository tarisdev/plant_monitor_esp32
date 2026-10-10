#include <DHT.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <time.h>
#include <stdio.h>
#include <Preferences.h>

// WiFi + Access Point fallback
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char *AP_SSID = "PlantMonitor";
const char *AP_PASSWORD = "YOUR_AP_PASSWORD";

// Firebase (Firestore)
#define FIREBASE_API_KEY  "YOUR_FIREBASE_API_KEY"
#define FIREBASE_PROJECT_ID "your-firebase-project-id"
#define FIREBASE_EMAIL    "your-firebase-writer-email@example.com"
#define FIREBASE_PASSWORD "YOUR_FIREBASE_WRITER_PASSWORD"

#define FS_PLANT "plants/monitor"               // document with 2 path segments
#define FS_LATEST "plants/monitor/latest/data"  // realtime document, 4 segments (/latest alone is not a valid doc path)
#define FS_READINGS "plants/monitor/readings"   // history collection

// Build stamp: __DATE__/__TIME__ changes on every compile and is stored in NVS at boot.
// A stamp differing from the stored one means a fresh flash -> the anchor resets and the
// ring restarts at slot_0000. Rebooting the same binary keeps the stamp, so no reset.
#define FIRMWARE_BUILD __DATE__ " " __TIME__

#define DHT_PIN 21
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

#define SOIL_PIN 34
#define SOIL_DRY 4095
#define SOIL_WET 1000

// Fixed sampling period (compile-time): DHT11 and YL-69 read every 15 minutes;
// the ring keeps 7 days -> MAX_HISTORY_RECORDS = 7 × 24 × 60 / 15 = 672 docs.
constexpr uint32_t SENSOR_INTERVAL_MINUTES = 15;
constexpr uint32_t HISTORY_RETENTION_DAYS = 7;
constexpr uint32_t HISTORY_INTERVAL_MS = SENSOR_INTERVAL_MINUTES * 60UL * 1000UL;
constexpr uint32_t MAX_HISTORY_RECORDS =
    (HISTORY_RETENTION_DAYS * 24UL * 60UL) / SENSOR_INTERVAL_MINUTES;

// Sensor state + push flag
float temperature = 0;
float humidity = 0;
int soilRaw = 0;
int soilPercent = 0;
unsigned long sensorReadInterval = (unsigned long)SENSOR_INTERVAL_MINUTES * 60000UL;
bool dhtOK = false;
unsigned long lastSensorRead = 0;
bool pendingPush = false;

// Firebase client
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
bool firebaseReady = false;
unsigned long lastFbTry = 0;
const unsigned long FB_RETRY_MS = 15000;
unsigned long lastRecoverTry = 0;
unsigned long lastNtpTry = 0; // throttle retry NTP (30s)

// Forward declarations
void readDHT();
void readSoil();
void pushToFirestore();

void connectWiFi() {
    Serial.println();
    Serial.println("==============================");
    Serial.println("Connecting to WiFi...");
    Serial.println(WIFI_SSID);
    Serial.println("==============================");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true); // background reconnect if WiFi drops mid-run
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long startTime = millis();

    while (WiFi.status() != WL_CONNECTED && millis() - startTime < 15000) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("WiFi connected!");
        Serial.print("IP address: ");
        Serial.println(WiFi.localIP());

        // NTP: sync the epoch so the web renders relative timestamps correctly
        configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
        Serial.println("NTP sync started");
    } else {
        Serial.println("WiFi connection failed!");
        Serial.println("Starting Access Point...");
        WiFi.mode(WIFI_AP);
        WiFi.softAP(AP_SSID, AP_PASSWORD);
        Serial.print("AP IP address: ");
        Serial.println(WiFi.softAPIP());
    }
}

void setupFirebase() {
    Serial.println();
    Serial.println("==============================");
    Serial.println("Firebase Firestore setup");
    Serial.println("==============================");
    config.api_key = FIREBASE_API_KEY;
    auth.user.email = FIREBASE_EMAIL;
    auth.user.password = FIREBASE_PASSWORD;
    config.token_status_callback = tokenStatusCallback;
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    firebaseReady = true;
    Serial.println("Firebase initialized (Email/Password)");
}

// NVS slot anchor (epoch ms of the first boot): first run = slot_0000,
// a reboot keeps the anchor so the slot never jumps.
static uint64_t anchor = 0; // 0 = not loaded / has been reset

uint64_t slotAnchorMs() {
    if (anchor != 0)
        return anchor;
    Preferences prefs;
    prefs.begin("slot", false);
    anchor = prefs.getULong64("anchor", 0);
    if (anchor == 0) {
        // Reached only after the NTP guard in pushToFirestore, so the epoch is always valid (never millis()).
        anchor = (uint64_t)time(nullptr) * 1000ULL;
        prefs.putULong64("anchor", anchor);
        Serial.printf("[slot] anchor moi = %.0f (slot dau = 0000)\n", (double)anchor);
    } else {
        Serial.printf("[slot] anchor NVS = %.0f\n", (double)anchor);
    }
    prefs.end();
    return anchor;
}

// Removes only the "anchor" key in the "slot" namespace (no full NVS wipe, no reboot).
// The next history write creates the new anchor, and only once NTP is synced.
// pendingPush is dropped so a queued sample never writes into the just-reset ring.
bool resetSlotAnchor() {
    Preferences prefs;
    prefs.begin("slot", false);
    bool ok = !prefs.isKey("anchor") || prefs.remove("anchor");
    prefs.end();
    anchor = 0;
    pendingPush = false;
    Serial.printf("[slot] anchor reset %s\n", ok ? "OK" : "FAIL: NVS remove");
    return ok;
}

// Called once from setup(): a fresh firmware flash clears the anchor so the next history
// write creates a new one and the first record lands on slot_0000. The build stamp lives in
// NVS, which distinguishes a fresh flash from a reboot (same binary -> no reset).
void maybeResetAnchorOnFlash() {
    Preferences prefs;
    prefs.begin("slot", false);
    bool fresh = prefs.getString("build", "") != FIRMWARE_BUILD;
    if (fresh)
        prefs.putString("build", FIRMWARE_BUILD);
    prefs.end();
    if (fresh) {
        Serial.printf("[slot] flash moi (%s) -> reset anchor, slot dau = 0000\n", FIRMWARE_BUILD);
        resetSlotAnchor();
    }
}

void pushToFirestore() {
    if (WiFi.status() != WL_CONNECTED)
        return;

    if (!firebaseReady) {
        if (millis() - lastFbTry > FB_RETRY_MS) {
            lastFbTry = millis();
            setupFirebase();
        }
        return;
    }

    if (Firebase.authTokenInfo().status != token_status_ready) {
        Serial.println("[FB] Refreshing auth token...");
        Firebase.refreshToken(&config);
        delay(1000);
        if (Firebase.authTokenInfo().status != token_status_ready)
            return;
    }

    unsigned long nowMs = millis();
    // epoch ms when NTP is synced, otherwise uptime millis
    time_t epoch = time(nullptr);
    bool synced = epoch > 1600000000;
    double ts = synced ? (double)epoch * 1000.0 : (double)nowMs;
    bool wifiOk = WiFi.status() == WL_CONNECTED;
    String ipStr = WiFi.localIP().toString();

    // Body = REST Document {"fields":{...}} with typed values
    // 1) Realtime latest: plants/monitor/latest/data
    char payloadLatest[640];
    snprintf(payloadLatest, sizeof(payloadLatest),
             "{\"fields\":{"
             "\"sensors\":{\"mapValue\":{\"fields\":{"
             "\"temperature\":{\"doubleValue\":%.2f},"
             "\"humidity\":{\"doubleValue\":%.2f},"
             "\"soilMoisture\":{\"integerValue\":\"%d\"},"
             "\"soilRaw\":{\"integerValue\":\"%d\"}"
             "}}},"
             "\"device\":{\"mapValue\":{\"fields\":{"
             "\"dhtOK\":{\"booleanValue\":%s},"
             "\"wifi\":{\"booleanValue\":%s},"
             "\"ip\":{\"stringValue\":\"%s\"},"
             "\"uptimeMs\":{\"integerValue\":\"%lu\"}"
             "}}},"
             "\"sync\":{\"mapValue\":{\"fields\":{"
             "\"timestamp\":{\"doubleValue\":%.0f},"
             "\"synced\":{\"booleanValue\":%s}"
             "}}}"
             "}}",
             temperature, humidity, soilPercent, soilRaw,
             dhtOK ? "true" : "false",
             wifiOk ? "true" : "false",
             ipStr.c_str(), nowMs,
             ts, synced ? "true" : "false");

    if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", FS_LATEST,
                                         payloadLatest, "sensors,device,sync")) {
        Serial.println("[FB] latest updated OK");
    } else {
        Serial.print("[FB] latest ERR: ");
        Serial.println(fbdo.errorReason());
    }

    // 2) History ring buffer: plants/monitor/readings/slot_%04u
    // Written only once NTP is synced: ts must be epoch ms, never millis()/uptime.
    if (!synced) {
        Serial.println("[FB] reading SKIP: NTP chưa sync (ts sẽ là epoch ms)");
        return;
    }

    // Ring buffer: slot = (ts - anchor) / HISTORY_INTERVAL_MS % MAX_HISTORY_RECORDS
    // -> first run = slot_0000, a reboot keeps it; after 672 slots (7 days x 96/day)
    // it wraps and overwrites old docs — no unbounded growth, no TTL/DELETE needed.
    uint64_t anchor = slotAnchorMs();
    uint64_t elapsed = (uint64_t)ts > anchor ? (uint64_t)ts - anchor : 0;
    uint32_t slot = (uint32_t)((elapsed / HISTORY_INTERVAL_MS) % MAX_HISTORY_RECORDS);

    char payloadReading[320];
    snprintf(payloadReading, sizeof(payloadReading),
             "{\"fields\":{"
             "\"temperature\":{\"doubleValue\":%.2f},"
             "\"humidity\":{\"doubleValue\":%.2f},"
             "\"soilMoisture\":{\"integerValue\":\"%d\"},"
             "\"soilRaw\":{\"integerValue\":\"%d\"},"
             "\"timestamp\":{\"doubleValue\":%.0f}"
             "}}",
             temperature, humidity, soilPercent, soilRaw, ts);

    char pathReading[96];
    // patchDocument = upsert; the updateMask covers all 5 fields, so a reused slot leaves no stale fields behind
    snprintf(pathReading, sizeof(pathReading), "%s/slot_%04u", FS_READINGS, slot);
    if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "", pathReading,
                                         payloadReading,
                                         "temperature,humidity,soilMoisture,soilRaw,timestamp")) {
        Serial.println("[FB] reading written OK");
    } else {
        Serial.print("[FB] reading ERR: ");
        Serial.println(fbdo.errorReason());
    }
}

void readDHT() {
    lastSensorRead = millis();
    Serial.println();
    Serial.println("[DHT11] Reading...");
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(h) && !isnan(t)) {
        humidity = h;
        temperature = t;
        dhtOK = true;
        Serial.print("[DHT11] Temperature: ");
        Serial.print(temperature, 1);
        Serial.print(" C | Humidity: ");
        Serial.print(humidity, 1);
        Serial.println(" %");
    } else {
        dhtOK = false;
        Serial.println("[DHT11] Read error!");
    }
}

void readSoil() {
    lastSensorRead = millis();
    Serial.println();
    Serial.println("[YL-69] Reading...");
    soilRaw = analogRead(SOIL_PIN);
    soilPercent = map(soilRaw, SOIL_DRY, SOIL_WET, 0, 100);
    soilPercent = constrain(soilPercent, 0, 100);
    Serial.print("[YL-69] Raw ADC: ");
    Serial.print(soilRaw);
    Serial.print(" | Soil: ");
    Serial.print(soilPercent);
    Serial.println("%");
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println();
    Serial.println("================================");
    Serial.println("  ESP32 PLANT MONITOR FIRESTORE");
    Serial.println("================================");

    Serial.printf("Chu kỳ đo cố định: %lu phút (DHT11 + YL-69)\n",
                  (unsigned long)SENSOR_INTERVAL_MINUTES);

    dht.begin();
    pinMode(SOIL_PIN, INPUT);

    connectWiFi();

    // NTP — wait for sync before the first push (ts must be an epoch, not millis)
    unsigned long ntpWaitStart = millis();
    while (time(nullptr) < 1600000000UL && millis() - ntpWaitStart < 8000) {
        delay(250);
    }
    Serial.println(time(nullptr) > 1600000000UL
                       ? "NTP synced OK"
                       : "NTP chưa sync sau 8s — history sẽ skip đến khi sync");
    setupFirebase();

    // A fresh flash resets the anchor (next history write = slot_0000); a reboot does not.
    maybeResetAnchorOnFlash();

    // Timer == 0: the first loop() iteration reads immediately, then every 15 minutes
}

void loop() {
    static unsigned long lastDHTRead = 0;
    static unsigned long lastSoilRead = 0;
    unsigned long now = millis();
    bool sensorRead = false;

    if (lastDHTRead == 0 || now - lastDHTRead >= sensorReadInterval) {
        lastDHTRead = now;
        readDHT();
        sensorRead = true;
    }

    if (lastSoilRead == 0 || now - lastSoilRead >= sensorReadInterval) {
        lastSoilRead = now;
        readSoil();
        sensorRead = true;
    }

    // Push exactly once per loop that read a sensor (never inside readDHT/readSoil,
    // which would push twice in one cycle and overwrite the same slot).
    // pendingPush: WiFi dropped during a read -> catch up when connectivity returns.
    if (sensorRead)
        pendingPush = true;

    if (pendingPush && WiFi.status() == WL_CONNECTED && Firebase.ready()) {
        pushToFirestore();
        pendingPush = false;
    }

    // Self-recovery, throttled (no blocking delay)
    if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastRecoverTry >= 30000UL) {
            lastRecoverTry = millis();
            if (WiFi.getMode() != WIFI_STA) {
                // A boot without WiFi fell back to AP mode (connectWiFi). While in AP mode
                // WiFi.reconnect() cannot bring STA up, so switch back to STA first.
                WiFi.mode(WIFI_STA);
                WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
                Serial.println("[WiFi] đang AP mode — trả về STA, thử nối lại");
            } else {
                WiFi.reconnect(); // background retry, does not block loop()
                Serial.println("[WiFi] mất — thử nối lại");
            }
        }
    } else if (!firebaseReady && millis() - lastRecoverTry >= FB_RETRY_MS) {
        // A boot without WiFi made config.begin fail -> retry now that the network is up
        lastRecoverTry = millis();
        Serial.println("[FB] retry begin — WiFi đã có");
        setupFirebase();
    } else if (firebaseReady && !Firebase.ready() && millis() - lastRecoverTry >= FB_RETRY_MS) {
        // Token not obtained on the first try, or a flaky network failed the fetch
        lastRecoverTry = millis();
        Serial.println("[FB] retry token");
        Firebase.refreshToken(&config);
    } else if (firebaseReady && Firebase.isTokenExpired()) {
        Firebase.refreshToken(&config);
    }

    // NTP retry (30s): a boot into AP mode never ran configTime, so after WiFi recovers
    // the epoch is still invalid and history would skip forever.
    if (millis() - lastNtpTry >= 30000UL && WiFi.status() == WL_CONNECTED &&
        time(nullptr) < 1600000000UL) {
        lastNtpTry = millis();
        configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
        Serial.println("[NTP] retry sync — epoch chưa hợp lệ");
    }
}
