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
    music?: {
      title?: string;
      artist?: string;
      album?: string;
      app?: string;
      playing?: boolean;
      duration?: number;
      elapsedTime?: number;
      bundleIdentifier?: string;
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

export interface MusicHistoryRecord {
  id: number;
  device_id: string;
  device_name: string;
  platform: string;
  app_name: string;
  title: string;
  artist: string;
  album: string;
  playing: number;
  started_at: string;
  created_at: string;
}
