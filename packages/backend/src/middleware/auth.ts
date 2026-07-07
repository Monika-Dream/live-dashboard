import type { DeviceInfo } from "../types";

const tokenMap = new Map<string, DeviceInfo>();
const configuredDeviceIds = new Set<string>();

// Parse DEVICE_TOKEN_N env vars: "token:device_id:device_name:platform"
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("DEVICE_TOKEN_") && value) {
    const parts = value.split(":");
    if (parts.length >= 4) {
      const [token, device_id, device_name, platform] = [
        parts[0],
        parts[1],
        parts.slice(2, -1).join(":"), // device_name may contain colons
        parts[parts.length - 1],
      ];
      if (
        token &&
        device_id &&
        device_name &&
        (platform === "windows" || platform === "android" || platform === "macos")
      ) {
        tokenMap.set(token, { device_id, device_name, platform });
        configuredDeviceIds.add(device_id);
      }
    }
  }
}

if (tokenMap.size === 0) {
  console.warn("[auth] No device tokens configured. Set DEVICE_TOKEN_N env vars.");
}

console.log(`[auth] Loaded ${tokenMap.size} device token(s)`);

export function authenticateToken(authHeader: string | null): DeviceInfo | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1];
  if (!token) return null;

  return tokenMap.get(token) || null;
}

export function isConfiguredDeviceId(deviceId: string): boolean {
  return configuredDeviceIds.has(deviceId);
}

export function getConfiguredDeviceIds(): string[] {
  return Array.from(configuredDeviceIds);
}
