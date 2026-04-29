import { getAllDeviceStates, getRecentActivities } from "../db";
import type { DeviceState, ActivityRecord } from "../types";
import { visitors } from "../services/visitors";
import { getAdminDeviceConfigs, isConfiguredDeviceId } from "../middleware/auth";

// Prepare records for public API: strip window_title, parse extra JSON
function preparePublicDevices(devices: DeviceState[]) {
  return devices.map(({ window_title, extra, ...rest }) => {
    let parsedExtra: Record<string, unknown> = {};
    try {
      parsedExtra = extra ? JSON.parse(extra) : {};
    } catch {
      // Malformed JSON — ignore
    }
    return { ...rest, extra: parsedExtra };
  });
}

function stripWindowTitle<T extends { window_title?: string }>(
  records: T[]
): Omit<T, "window_title">[] {
  return records.map(({ window_title, ...rest }) => rest);
}

function buildOfflineDeviceState(device: {
  device_id: string;
  device_name: string;
  platform: string;
}): DeviceState {
  return {
    device_id: device.device_id,
    device_name: device.device_name,
    platform: device.platform,
    app_id: "offline",
    app_name: "offline",
    window_title: "",
    display_title: "",
    last_seen_at: "",
    is_online: 0,
    extra: "{}",
  };
}

export function handleCurrent(clientIp: string, userAgent?: string): Response {
  visitors.heartbeat(clientIp, userAgent);

  const devices = (getAllDeviceStates.all() as DeviceState[]).filter((device) =>
    isConfiguredDeviceId(device.device_id)
  );
  const existingDeviceIds = new Set(devices.map((device) => device.device_id));

  for (const configuredDevice of getAdminDeviceConfigs()) {
    if (!existingDeviceIds.has(configuredDevice.device_id)) {
      devices.push(buildOfflineDeviceState(configuredDevice));
    }
  }

  const recentActivities = (getRecentActivities.all() as ActivityRecord[]).filter((activity) =>
    isConfiguredDeviceId(activity.device_id)
  );

  return Response.json({
    devices: preparePublicDevices(devices),
    recent_activities: stripWindowTitle(recentActivities),
    server_time: new Date().toISOString(),
    viewer_count: visitors.getCount(),
  });
}
