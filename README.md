# 🌱 Plant Monitor

**ESP32 → Firebase Firestore → Web Dashboard**

A bilingual guide for setting up the plant-monitoring system. Each section is written in Vietnamese first, followed by English.

README hướng dẫn cài đặt hệ thống giám sát cây trồng. Mỗi mục có tiếng Việt trước, tiếng Anh sau.

---

## 1. Overview / Tổng quan

**VI:** ESP32 đọc nhiệt độ và độ ẩm không khí từ DHT11, độ ẩm đất từ YL-69, rồi gửi dữ liệu lên Cloud Firestore. Dashboard web hiển thị dữ liệu mới nhất, biểu đồ và lịch sử đo.

**EN:** The ESP32 reads air temperature/humidity from the DHT11 and soil moisture from the YL-69, then uploads the data to Cloud Firestore. The web dashboard displays live readings, charts, and measurement history.

```text
DHT11 + YL-69
      ↓
    ESP32 ── every 15 minutes ──► Cloud Firestore ──► Web dashboard
                                      │
                                      ├─ plants/monitor/latest/data
                                      └─ plants/monitor/readings/slot_0000 … slot_0671
```

### Data storage / Lưu dữ liệu

- **Latest state:** `plants/monitor/latest/data` — current sensor and device status.
- **History:** `plants/monitor/readings/slot_0000` to `slot_0671` — up to 7 days of readings.
- History uses a **ring buffer**: each 15-minute sample is assigned to a slot, and old records are overwritten after 672 slots. The number of documents therefore stays limited.
- The web dashboard only reads Firestore. Reads are public; writes are restricted to the ESP32 Firebase account.

**VI:** Dữ liệu mới nhất nằm trong `latest/data`; lịch sử nằm trong 672 slot, tương đương 7 ngày nếu đo mỗi 15 phút. Khi đầy vòng, dữ liệu cũ được ghi đè nên số document không tăng vô hạn.

**EN:** Current data is stored in `latest/data`; history uses 672 slots, equal to 7 days at 15-minute intervals. Once the buffer is full, old readings are overwritten instead of creating more documents.

---

## 2. Requirements / Chuẩn bị

| Item / Thành phần | Notes / Ghi chú |
|---|---|
| ESP32 DevKit, DHT11, YL-69 | YL-69 uses the analog output (AO) |
| VS Code + PlatformIO, or Arduino IDE | PlatformIO is recommended |
| Node.js 18+ | Node.js 24 has been tested |
| Google account | Needed to create a Firebase project |

---

## 3. Set up Firebase / Cấu hình Firebase

Complete this section **before flashing the ESP32**.

Thực hiện các bước này **trước khi nạp firmware**.

### 3.1 Create a Firebase project and Firestore / Tạo project và Firestore

1. Open [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Go to **Build → Firestore Database → Create database**.
3. Select **Production mode** and choose a region close to your users, for example `asia-southeast1`.
4. You do not need to create collections manually; the ESP32 creates them when it first writes data.

**VI:** Vào Firebase Console, tạo project, sau đó tạo Firestore ở **Production mode**. Không cần tạo collection thủ công.

### 3.2 Create the ESP32 account / Tạo tài khoản cho ESP32

1. Go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Open **Users → Add user** and create an email/password account for the ESP32.
4. Open that user and copy its **UID**. You will use it in the next step.

**VI:** Bật đăng nhập Email/Password, tạo tài khoản riêng cho ESP32 và sao chép UID của tài khoản đó.

### 3.3 Configure the web app / Cấu hình web

1. In Firebase, open **Project settings → General → Your apps**.
2. Register a **Web app** (`</>`) and copy its Firebase config.
3. In the repository, create `web/.env` from the example if needed:

```bash
cd web
copy .env.example .env
```

4. Fill in the values:

```dotenv
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="..."
VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
VITE_FIREBASE_MEASUREMENT_ID="G-..."
```

`VITE_FIREBASE_MEASUREMENT_ID` is optional.

**VI:** Điền giá trị từ `firebaseConfig` vào `web/.env`. Các biến web phải có tiền tố `VITE_`. Web config được dùng ở phía trình duyệt; quyền truy cập dữ liệu phải được bảo vệ bằng Firestore Rules.

**EN:** Copy the values from `firebaseConfig` into `web/.env`. Web variables must start with `VITE_`. The web config is used in the browser; Firestore Rules control access to the data.

### 3.4 Set Firestore Rules / Cấu hình quyền truy cập

1. Open `firestore.rules` in the repository root.
2. Replace the placeholder UID in `isWriter()` with the UID copied in step 3.2.
3. Publish the rules in **Firestore Database → Rules**, or deploy with Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

The intended access model is: **anyone can read; only the ESP32 account can write**.

**VI:** Thay UID mẫu bằng UID tài khoản ESP32 rồi Publish rules. Web được phép đọc mà không cần đăng nhập; chỉ tài khoản ESP32 được ghi.

**EN:** Replace the placeholder UID with the ESP32 account UID and publish the rules. The dashboard can read without signing in; only the ESP32 account can write.

---

## 4. Set up the ESP32 / Cấu hình ESP32

### 4.1 Wiring / Đấu dây

| Component / Linh kiện | Pin / Chân | ESP32 |
|---|---|---|
| DHT11 | DATA | GPIO21 |
| DHT11 | VCC / GND | 3V3 / GND |
| YL-69 | AO | GPIO34 |
| YL-69 | VCC / GND | 3V3 / GND |

If the DHT11 module does not have a built-in pull-up resistor, connect a **10 kΩ resistor from DATA to 3V3**.

**VI:** Nếu module DHT11 chưa có điện trở kéo lên, mắc điện trở 10 kΩ giữa DATA và 3V3. Dùng chân AO của YL-69 nối GPIO34.

### 4.2 Enter Wi-Fi and Firebase settings / Nhập cấu hình Wi-Fi và Firebase

Open `firmware/plant_monitor.ino` and update the configuration block near the top:

```cpp
const char* WIFI_SSID = "...";
const char* WIFI_PASSWORD = "...";

#define FIREBASE_API_KEY "..."
#define FIREBASE_PROJECT_ID "your-firebase-project-id"
#define FIREBASE_EMAIL "..."
#define FIREBASE_PASSWORD "..."

#define FS_PLANT "plants/monitor"
#define FS_LATEST "plants/monitor/latest/data"
#define FS_READINGS "plants/monitor/readings"
```

Keep the `FS_*` paths unchanged unless you also update the web app and its checks.

**VI:** Điền Wi-Fi và thông tin Firebase của bạn. Giữ nguyên các đường dẫn `FS_*` để firmware và dashboard khớp nhau.

**EN:** Enter your Wi-Fi and Firebase details. Keep the `FS_*` paths unchanged so the firmware and dashboard stay in sync.

> **Security / Bảo mật:** `firmware/plant_monitor.ino` contains Wi-Fi and Firebase account credentials in plain text. Do not publish real credentials in a public repository. Move them to a Git-ignored header and change the writer password before publishing. `web/.env` contains web config, not the ESP32 account password.

### 4.3 Build and flash / Biên dịch và nạp firmware

**Option 1 — PlatformIO (recommended / khuyến nghị)**

```bash
cd firmware
pio run -t upload -t monitor
```

**Option 2 — Arduino IDE**

1. Open `firmware/plant_monitor.ino`.
2. Install **ESP32 by Espressif**, **Firebase Arduino Client Library for ESP8266 and ESP32** (mobizt), and **DHT sensor library** (Adafruit).
3. Select **ESP32 Dev Module**, upload, and open Serial Monitor at **115200 baud**.

### 4.4 Verify the data / Kiểm tra dữ liệu

The Serial Monitor should show messages similar to:

```text
NTP synced OK
[DHT11] Temperature: 31.3 C | Humidity: 43.0 %
[YL-69] Raw ADC: 3050 | Soil: 25%
[FB] latest updated OK
[FB] reading written OK
```

In **Firestore Database → Data**, check for:

```text
plants
└── monitor
    ├── latest
    │   └── data
    └── readings
        ├── slot_0000
        ├── slot_0001
        └── ...
```

---

## 5. Firmware behavior / Cách firmware hoạt động

- **Sampling interval:** one reading every 15 minutes. The interval cannot be changed from the dashboard.
- **History requires NTP:** history is written only after time synchronization succeeds. If NTP fails, `latest` can still update, but history is skipped.
- **Wi-Fi unavailable at boot:** the ESP32 starts an access point named `PlantMonitor` with password `12345678`, then retries connecting to Wi-Fi. A pending sample is sent when the connection is available.
- **New firmware flash:** the build stamp is stored in NVS. A changed stamp resets the ring-buffer anchor; the next history write starts at `slot_0000`.
- **Normal reboot:** restarting the same firmware does not reset the anchor or slot position.
- **Clear history:** the local-IP admin page has been removed. To clear history, delete the `plants/monitor/readings` collection in Firebase Console, or wait for the ring buffer to overwrite old records.
- Both sensors are uploaded together in one push per sample.

**VI:** Mỗi 15 phút firmware lấy mẫu. Lịch sử cần NTP để có timestamp chính xác. Nạp firmware mới sẽ tự reset anchor và bắt đầu lại từ `slot_0000`; khởi động lại bình thường thì không. Trang quản trị qua local IP đã bị gỡ bỏ.

**EN:** The firmware samples every 15 minutes. History requires NTP for valid timestamps. Flashing a new firmware resets the anchor and starts again at `slot_0000`; a normal reboot does not. The local-IP admin page has been removed.

**Important:** `pio run -t erase` or **Erase Flash** clears NVS, including saved Wi-Fi credentials and the build stamp.

**Lưu ý:** `pio run -t erase` hoặc **Erase Flash** sẽ xóa NVS, bao gồm Wi-Fi đã lưu và dấu phiên bản firmware.

---

## 6. Run the web dashboard / Chạy dashboard web

### 6.1 Run locally / Chạy trên máy

```bash
cd web
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

**VI:** Dashboard đọc Firestore nên không cần đăng nhập. Đảm bảo `web/.env` đã được cấu hình.

**EN:** The dashboard reads Firestore without signing in. Make sure `web/.env` is configured.

### 6.2 Build and preview / Build và xem thử

Run these commands from the `web` directory:

```bash
npm run build
npm run preview
```

The production files are generated in `web/dist/`. You can deploy them to a static host such as Firebase Hosting, Netlify, Vercel, or GitHub Pages.

**VI:** Thư mục `web/dist/` chứa website tĩnh sau khi build, có thể triển khai lên dịch vụ hosting tĩnh.

### 6.3 Dashboard features / Chức năng dashboard

| Feature / Chức năng | Description / Mô tả |
|---|---|
| KPI cards | Temperature, air humidity, soil moisture, raw ADC |
| Charts | Temperature/air humidity and soil moisture |
| Time range | 30 minutes, 6 hours, 1 day, 3 days, or 7 days |
| Data log | Readings in the selected range, newest first |
| Device status | DHT11, Wi-Fi, IP, uptime, NTP, latest slot |
| Status indicator | Green: live updates; yellow: no data; red: Firestore error |

---

## 7. Tests / Kiểm thử

Run from the repository root:

```bash
node firmware/payload.check.cjs
cd web
npm run build
```

`payload.check.cjs` checks that firmware document paths, fields, and data types match what the web app expects.

**VI:** Lệnh kiểm tra payload giúp phát hiện khi cấu trúc dữ liệu firmware không còn khớp với dashboard.

**EN:** The payload check catches mismatches between the firmware data structure and the dashboard.

---

## 8. Troubleshooting / Xử lý sự cố

| Symptom / Triệu chứng | What to check / Cách xử lý |
|---|---|
| `permission-denied` in dashboard | Publish `firestore.rules`; check that `web/.env` points to the right project |
| Blank dashboard | Check `VITE_FIREBASE_PROJECT_ID` and the other values in `web/.env` |
| `[FB] latest ERR: ...` | Check Firebase API key, writer email/password, and Email/Password sign-in |
| `[FB] reading SKIP: NTP not synced` | Check Wi-Fi, internet access, and DNS |
| Latest data appears, but charts are empty | Check whether `readings` has samples and whether NTP synchronized |
| Dashboard time is incorrect | Check the computer's time zone; the firmware uses UTC+7 |
| DHT11 shows a read error | Check wiring and the pull-up resistor |
| Wi-Fi does not reconnect | This firmware retries switching back to station mode every 30 seconds |
| Need to delete history | Delete `plants/monitor/readings` in Firebase Console |
| Anchor resets on every boot | Check whether NVS is being erased and whether the build stamp persists |

---

## 9. Data schema / Cấu trúc dữ liệu

The firmware writes two documents each cycle.

Firmware ghi hai nơi sau mỗi chu kỳ.

### Latest document: `plants/monitor/latest/data`

| Field | Type | Meaning / Ý nghĩa |
|---|---|---|
| `sensors.temperature` | double | Air temperature, °C |
| `sensors.humidity` | double | Air humidity, % |
| `sensors.soilMoisture` | int | Soil moisture, 0–100% |
| `sensors.soilRaw` | int | Raw ADC value, 0–4095 |
| `device.dhtOK` | bool | Whether the latest DHT11 read succeeded |
| `device.wifi` | bool | Wi-Fi connection status |
| `device.ip` | string | ESP32 IP address |
| `device.uptimeMs` | int | Uptime in milliseconds |
| `sync.timestamp` | double | Unix timestamp in milliseconds |
| `sync.synced` | bool | Whether NTP has synchronized |

### History documents: `plants/monitor/readings/slot_0000` … `slot_0671`

| Field | Type | Meaning / Ý nghĩa |
|---|---|---|
| `temperature`, `humidity` | double | Air readings |
| `soilMoisture`, `soilRaw` | int | Soil moisture percentage and raw ADC |
| `timestamp` | double | Unix timestamp in milliseconds |

The history capacity is **672 readings**: 7 days × 24 hours × 4 readings per hour.

Dung lượng lịch sử là **672 mẫu**: 7 ngày × 24 giờ × 4 mẫu mỗi giờ.

---

## 10. Design notes / Ghi chú kỹ thuật

- The dashboard uses Firestore real-time listeners for the latest reading and history.
- `HISTORY_LIMIT` in `web/src/main.ts` is `672`, matching one full ring-buffer cycle. If you change the history capacity, keep the firmware and web settings consistent.
- To change document paths or sensor fields, update the firmware and the matching definitions in `web/src/main.ts`.
- The dashboard is read-only; configuration and sensor sampling are handled by the firmware.

**VI:** Dashboard nhận dữ liệu realtime từ Firestore. Nếu thay đổi đường dẫn, field hoặc số lượng mẫu lịch sử, cần cập nhật đồng bộ firmware và `web/src/main.ts`.

**EN:** The dashboard receives real-time updates from Firestore. If document paths, fields, or history capacity change, update both the firmware and `web/src/main.ts`.
