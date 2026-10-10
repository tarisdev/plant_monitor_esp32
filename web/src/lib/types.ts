/* ---------- shapes written by the firmware payload ---------- */
export type Sensors = {
  temperature?: number;
  humidity?: number;
  soilMoisture?: number;
  soilRaw?: number;
};
export type Device = {
  dhtOK?: boolean;
  wifi?: boolean;
  ip?: string;
  uptimeMs?: number;
};
export type Sync = { timestamp?: number; synced?: boolean };
export type Latest = { sensors?: Sensors; device?: Device; sync?: Sync };
export type Reading = {
  id: string;
  timestamp: number;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  soilRaw: number;
};

export type Lang = "vi" | "en";