import type { Lang } from "./types";

type I18nValue = string | ((...args: any[]) => string);
const dict: Record<Lang, Record<string, I18nValue>> = {
  vi: {
    title: "Plant Monitor — Bảng điều khiển",
    brandTagline: "DHT11 + YL-69 · lấy mẫu mỗi 15 phút · lưu 7 ngày",
    lastUpdate: "Cập nhật cuối",
    connecting: "Đang kết nối…",
    live: "Đang nhận dữ liệu trực tiếp",
    noState: "Chưa có bản ghi trạng thái",
    firestoreError: "Lỗi Firestore",
    noData: "Chưa có dữ liệu — kiểm tra ESP32 đã gửi lên Firestore chưa.",
    kpiTemp: "Nhiệt độ",
    kpiHum: "Độ ẩm không khí",
    kpiSoil: "Độ ẩm đất",
    kpiAdc: "ADC đất",
    kpiAdcFoot: "GPIO34 · 0–4095",
    chartClimate: "Nhiệt độ & Độ ẩm không khí",
    chartSoil: "Độ ẩm đất",
    soilThreshold: "Ngưỡng cần tưới",
    logData: "Log dữ liệu",
    time: "Thời gian",
    tempShort: "Nhiệt độ",
    humShort: "Độ ẩm KK",
    soilShort: "Độ ẩm đất",
    adc: "ADC",
    slot: "Slot",
    device: "Thiết bị",
    dht: "DHT11",
    wifi: "WiFi",
    ip: "Địa chỉ IP",
    uptime: "Uptime",
    ntpSync: "Đồng bộ NTP",
    latestSlot: "Slot gần nhất",
    statusOk: "Hoạt động",
    statusBad: "Lỗi đọc",
    wifiOk: "Đã kết nối",
    wifiBad: "Mất kết nối",
    syncOk: "Đã đồng bộ",
    syncBad: "Chưa đồng bộ",
    soilNow: (v: string, ok: boolean) => `${v}% — ${ok ? "đủ ẩm" : "cần tưới"}`,
    logCount: (v: number, total: number, label: string) =>
      `${v}/${total} mẫu trong ${label} gần nhất`,
    logCountEmpty: (label: string) => `chưa có mẫu nào`,
    agoSec: "giây trước",
    agoMin: "phút trước",
    agoHour: "giờ trước",
    agoDay: "ngày trước",
    range30m: "30 phút",
    range6h: "6 giờ",
    range1d: "1 ngày",
    range3d: "3 ngày",
    range7d: "7 ngày",
    tempCold: "Lạnh",
    tempCool: "Mát mẻ",
    tempWarm: "Ấm",
    tempHot: "Nóng",
    humDry: "Khô",
    humOk: "Phù hợp",
    humWet: "Ẩm",
    soilDry: "Cần tưới",
    soilOk: "Đủ ẩm",
    soilWet: "Quá ẩm",
  },
  en: {
    title: "Plant Monitor — Dashboard",
    brandTagline: "DHT11 + YL-69 · samples every 15 min · 7-day history",
    lastUpdate: "Last updated",
    connecting: "Connecting…",
    live: "Receiving live data",
    noState: "No latest state yet",
    firestoreError: "Firestore error",
    noData: "No data yet — check if ESP32 has pushed to Firestore.",
    kpiTemp: "Temperature",
    kpiHum: "Air humidity",
    kpiSoil: "Soil moisture",
    kpiAdc: "Soil ADC",
    kpiAdcFoot: "GPIO34 · 0–4095",
    chartClimate: "Temperature & Air Humidity",
    chartSoil: "Soil Moisture",
    soilThreshold: "Watering threshold",
    logData: "Data log",
    time: "Time",
    tempShort: "Temp",
    humShort: "Air Hum",
    soilShort: "Soil Hum",
    adc: "ADC",
    slot: "Slot",
    device: "Device",
    dht: "DHT11",
    wifi: "WiFi",
    ip: "IP address",
    uptime: "Uptime",
    ntpSync: "NTP sync",
    latestSlot: "Latest slot",
    statusOk: "OK",
    statusBad: "Read error",
    wifiOk: "Connected",
    wifiBad: "Disconnected",
    syncOk: "Synced",
    syncBad: "Not synced",
    soilNow: (v: string, ok: boolean) => `${v}% — ${ok ? "moist" : "needs water"}`,
    logCount: (v: number, total: number, label: string) =>
      `${v}/${total} samples in last ${label}`,
    logCountEmpty: (_label: string) => "no samples yet",
    agoSec: "s ago",
    agoMin: "m ago",
    agoHour: "h ago",
    agoDay: "d ago",
    range30m: "30 min",
    range6h: "6 hours",
    range1d: "1 day",
    range3d: "3 days",
    range7d: "7 days",
    tempCold: "Cold",
    tempCool: "Cool",
    tempWarm: "Warm",
    tempHot: "Hot",
    humDry: "Dry",
    humOk: "OK",
    humWet: "Humid",
    soilDry: "Thirsty",
    soilOk: "Moist",
    soilWet: "Wet",
  },
};

let currentLang: Lang = "vi";

export function setLang(l: Lang) {
  currentLang = l;
  localStorage.setItem("lang", l);
  document.documentElement.lang = l;
  document.title = t("title");
  // apply data-i18n
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const raw = dict[currentLang][key];
    if (typeof raw === "string") el.textContent = raw;
  });
}

export function t(key: string): string {
  const raw = (dict[currentLang] as any)[key];
  return typeof raw === "string" ? raw : key;
}

export function tpl(key: string, ...args: any[]): string {
  const raw = (dict[currentLang] as any)[key];
  if (typeof raw === "function") return raw(...args);
  return typeof raw === "string" ? raw : key;
}

export function getLang(): Lang {
  return currentLang;
}