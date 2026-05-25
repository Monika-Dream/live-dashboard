export interface DeviceInfo {
  device_id: string;
  device_name: string;
  platform: "windows" | "android" | "macos";
}

export interface ReportPayload {
  app_id: string;
  window_title?: string;
  timestamp?: string;
  extra?: {
    battery_percent?: number;
    battery_charging?: boolean;
    device?: {
      network_connected?: boolean;
      vpn_active?: boolean;
      vpn_name?: string;
      capability_mode?: "normal" | "root" | "lsposed";
      last_sample_at?: string;
    };
    location?: {
      latitude?: number;
      longitude?: number;
      accuracy_m?: number;
      provider?: string;
      recorded_at?: string;
    };
    foreground?: {
      package_name?: string;
      app_name?: string;
      activity?: string;
      source?: "normal" | "root" | "lsposed";
      confidence?: number;
    };
    input?: {
      input_active?: boolean;
      is_typing?: boolean;
      source?: "normal" | "root" | "lsposed";
    };
    media?: {
      playing?: boolean;
      title?: string;
      artist?: string;
      app?: string;
      state?: string;
      source?: "normal" | "root" | "lsposed";
    };
  };
}

export interface ActivityRecord {
  id: number;
  device_id: string;
  device_name: string;
  platform: string;
  app_id: string;
  app_name: string;
  window_title: string;
  display_title: string;
  started_at: string;
  created_at: string;
}

export interface DeviceState {
  device_id: string;
  device_name: string;
  platform: string;
  app_id: string;
  app_name: string;
  window_title: string;
  display_title: string;
  last_seen_at: string;
  is_online: number;
  extra: string; // JSON string
}

export interface TimelineSegment {
  app_name: string;
  app_id: string;
  display_title: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  device_id: string;
  device_name: string;
}

export interface HealthRecord {
  device_id: string;
  type: string;
  value: number;
  unit: string;
  recorded_at: string;
  end_time: string;
}

export interface LocationRecord {
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  provider: string;
  recorded_at: string;
}
