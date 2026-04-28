import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH || "./live-dashboard.db";

export const db = new Database(DB_PATH, { create: true });

// Performance pragmas
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA busy_timeout = 5000");
db.run("PRAGMA synchronous = NORMAL");

// Activities table
db.run(`
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    window_title TEXT DEFAULT '',
    title_hash TEXT NOT NULL DEFAULT '',
    time_bucket INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Dedup unique constraint
db.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup
  ON activities(device_id, app_id, title_hash, time_bucket)
`);

// Query indexes
db.run(`
  CREATE INDEX IF NOT EXISTS idx_activities_device_started
  ON activities(device_id, started_at DESC)
`);
db.run(`
  CREATE INDEX IF NOT EXISTS idx_activities_started
  ON activities(started_at DESC)
`);
db.run(`
  CREATE INDEX IF NOT EXISTS idx_activities_created
  ON activities(created_at)
`);

// Device states table
db.run(`
  CREATE TABLE IF NOT EXISTS device_states (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    window_title TEXT DEFAULT '',
    last_seen_at TEXT NOT NULL,
    is_online INTEGER DEFAULT 1
  )
`);

// ── Schema migration: add display_title + extra columns ──

const KNOWN_TABLES = new Set(["activities", "device_states"]);

function columnExists(table: string, column: string): boolean {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`columnExists: unknown table "${table}"`);
  }
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

// activities.display_title
if (!columnExists("activities", "display_title")) {
  db.run("ALTER TABLE activities ADD COLUMN display_title TEXT DEFAULT ''");
}

// device_states.display_title
if (!columnExists("device_states", "display_title")) {
  db.run("ALTER TABLE device_states ADD COLUMN display_title TEXT DEFAULT ''");
}

// device_states.extra (JSON string for battery, etc.)
if (!columnExists("device_states", "extra")) {
  db.run("ALTER TABLE device_states ADD COLUMN extra TEXT DEFAULT '{}'");
}

// ── Health records table ──

db.run(`
  CREATE TABLE IF NOT EXISTS health_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    type TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    end_time TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(device_id, type, recorded_at, end_time)
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_health_records_recorded
  ON health_records(recorded_at)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_health_records_type
  ON health_records(type, recorded_at)
`);

// ── Device consent table (privacy/compliance) ──

db.run(`
  CREATE TABLE IF NOT EXISTS device_consents (
    device_id TEXT PRIMARY KEY,
    consent_version INTEGER NOT NULL DEFAULT 1,
    activity_reporting INTEGER NOT NULL DEFAULT 0,
    health_reporting INTEGER NOT NULL DEFAULT 0,
    granted_scopes TEXT NOT NULL DEFAULT '[]',
    granted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// ── External dashboards (runtime managed) ──

db.run(`
  CREATE TABLE IF NOT EXISTS external_dashboards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS hidden_external_dashboards (
    id TEXT PRIMARY KEY,
    hidden_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ── Runtime-managed device tokens (for admin panel edits) ──

db.run(`
  CREATE TABLE IF NOT EXISTS runtime_device_configs (
    device_id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_runtime_device_configs_platform
  ON runtime_device_configs(platform)
`);

// ── Runtime-managed site settings (for admin panel edits) ──

db.run(`
  CREATE TABLE IF NOT EXISTS runtime_site_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ── HMAC hash secret validation ──

const HASH_SECRET = process.env.HASH_SECRET || "";
if (!HASH_SECRET) {
  console.error("[db] FATAL: HASH_SECRET not set. This is required for privacy-safe title hashing.");
  console.error("[db] Generate one with: openssl rand -hex 32");
  process.exit(1);
}

export function hmacTitle(title: string): string {
  const hmac = new Bun.CryptoHasher("sha256", HASH_SECRET);
  hmac.update(title);
  return hmac.digest("hex");
}

// Prepared statements
export const insertActivity = db.prepare(`
  INSERT INTO activities (device_id, device_name, platform, app_id, app_name, window_title, display_title, title_hash, time_bucket, started_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_id, app_id, title_hash, time_bucket) DO NOTHING
`);

export const upsertDeviceState = db.prepare(`
  INSERT INTO device_states (device_id, device_name, platform, app_id, app_name, window_title, display_title, last_seen_at, extra, is_online)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(device_id) DO UPDATE SET
    device_name = excluded.device_name,
    platform = excluded.platform,
    app_id = excluded.app_id,
    app_name = excluded.app_name,
    window_title = excluded.window_title,
    display_title = excluded.display_title,
    last_seen_at = excluded.last_seen_at,
    extra = excluded.extra,
    is_online = 1
`);

export const getAllDeviceStates = db.prepare(`
  SELECT * FROM device_states ORDER BY last_seen_at DESC
`);

export const getRecentActivities = db.prepare(`
  SELECT * FROM activities ORDER BY started_at DESC LIMIT 20
`);

export const getTimelineByDate = db.prepare(`
  SELECT * FROM activities
  WHERE date(started_at) = ?
  ORDER BY started_at ASC
`);

export const getTimelineByDateAndDevice = db.prepare(`
  SELECT * FROM activities
  WHERE date(started_at) = ? AND device_id = ?
  ORDER BY started_at ASC
`);

export const markOfflineDevices = db.prepare(`
  UPDATE device_states SET is_online = 0
  WHERE is_online = 1
  AND (last_seen_at IS NULL OR last_seen_at = '' OR datetime(last_seen_at) IS NULL
       OR datetime(last_seen_at) < datetime('now', '-1 minute'))
`);

export const cleanupOldActivities = db.prepare(`
  DELETE FROM activities WHERE created_at < datetime('now', '-7 days')
`);

const getExternalDashboardsStmt = db.prepare(`
  SELECT id, name, url, description
  FROM external_dashboards
  ORDER BY created_at ASC
`);

const upsertExternalDashboardStmt = db.prepare(`
  INSERT INTO external_dashboards (id, name, url, description, created_at, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    url = excluded.url,
    description = excluded.description,
    updated_at = datetime('now')
`);

const deleteExternalDashboardStmt = db.prepare(`
  DELETE FROM external_dashboards
  WHERE id = ?
`);

const getHiddenExternalDashboardIdsStmt = db.prepare(`
  SELECT id
  FROM hidden_external_dashboards
`);

const hideExternalDashboardStmt = db.prepare(`
  INSERT INTO hidden_external_dashboards (id, hidden_at)
  VALUES (?, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    hidden_at = datetime('now')
`);

const unhideExternalDashboardStmt = db.prepare(`
  DELETE FROM hidden_external_dashboards
  WHERE id = ?
`);

const getRuntimeDeviceConfigsStmt = db.prepare(`
  SELECT token, device_id, device_name, platform
  FROM runtime_device_configs
  ORDER BY device_id ASC
`);

const deleteRuntimeDeviceByTokenForOtherDeviceStmt = db.prepare(`
  DELETE FROM runtime_device_configs
  WHERE token = ? AND device_id <> ?
`);

const upsertRuntimeDeviceConfigStmt = db.prepare(`
  INSERT INTO runtime_device_configs (token, device_id, device_name, platform, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(device_id) DO UPDATE SET
    token = excluded.token,
    device_name = excluded.device_name,
    platform = excluded.platform,
    updated_at = datetime('now')
`);

const deleteRuntimeDeviceConfigStmt = db.prepare(`
  DELETE FROM runtime_device_configs
  WHERE device_id = ?
`);

const getRuntimeSiteSettingsStmt = db.prepare(`
  SELECT setting_key, setting_value
  FROM runtime_site_settings
`);

const upsertRuntimeSiteSettingStmt = db.prepare(`
  INSERT INTO runtime_site_settings (setting_key, setting_value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(setting_key) DO UPDATE SET
    setting_value = excluded.setting_value,
    updated_at = datetime('now')
`);

const deleteRuntimeSiteSettingStmt = db.prepare(`
  DELETE FROM runtime_site_settings
  WHERE setting_key = ?
`);

export type ExternalDashboardRecord = {
  id: string;
  name: string;
  url: string;
  description?: string;
};

export type RuntimeDeviceConfigRecord = {
  token: string;
  device_id: string;
  device_name: string;
  platform: string;
};

export function getExternalDashboards(): ExternalDashboardRecord[] {
  return getExternalDashboardsStmt.all() as ExternalDashboardRecord[];
}

export function upsertExternalDashboard(record: ExternalDashboardRecord): void {
  upsertExternalDashboardStmt.run(
    record.id,
    record.name,
    record.url,
    record.description ?? "",
  );
  unhideExternalDashboardStmt.run(record.id);
}

export function deleteExternalDashboard(id: string): number {
  return deleteExternalDashboardStmt.run(id).changes;
}

export function getHiddenExternalDashboardIds(): string[] {
  const rows = getHiddenExternalDashboardIdsStmt.all() as { id: string }[];
  return rows.map((row) => row.id);
}

export function hideExternalDashboard(id: string): void {
  hideExternalDashboardStmt.run(id);
}

export function getRuntimeDeviceConfigs(): RuntimeDeviceConfigRecord[] {
  return getRuntimeDeviceConfigsStmt.all() as RuntimeDeviceConfigRecord[];
}

export function upsertRuntimeDeviceConfig(record: RuntimeDeviceConfigRecord): void {
  const tx = db.transaction((input: RuntimeDeviceConfigRecord) => {
    deleteRuntimeDeviceByTokenForOtherDeviceStmt.run(input.token, input.device_id);
    upsertRuntimeDeviceConfigStmt.run(
      input.token,
      input.device_id,
      input.device_name,
      input.platform,
    );
  });

  tx(record);
}

export function deleteRuntimeDeviceConfig(deviceId: string): number {
  return deleteRuntimeDeviceConfigStmt.run(deviceId).changes;
}

export function getRuntimeSiteSettings(): Record<string, string> {
  const rows = getRuntimeSiteSettingsStmt.all() as {
    setting_key: string;
    setting_value: string;
  }[];

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.setting_key] = row.setting_value;
  }
  return result;
}

export function upsertRuntimeSiteSetting(key: string, value: string): void {
  upsertRuntimeSiteSettingStmt.run(key, value);
}

export function deleteRuntimeSiteSetting(key: string): void {
  deleteRuntimeSiteSettingStmt.run(key);
}

export const upsertDeviceConsent = db.prepare(`
  INSERT INTO device_consents (
    device_id,
    consent_version,
    activity_reporting,
    health_reporting,
    granted_scopes,
    granted_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_id) DO UPDATE SET
    consent_version = excluded.consent_version,
    activity_reporting = excluded.activity_reporting,
    health_reporting = excluded.health_reporting,
    granted_scopes = excluded.granted_scopes,
    granted_at = excluded.granted_at,
    updated_at = excluded.updated_at
`);

const getDeviceConsentById = db.prepare(`
  SELECT
    device_id,
    consent_version,
    activity_reporting,
    health_reporting,
    granted_scopes,
    granted_at,
    updated_at
  FROM device_consents
  WHERE device_id = ?
  LIMIT 1
`);

type DeviceConsentRow = {
  device_id: string;
  consent_version: number;
  activity_reporting: number;
  health_reporting: number;
  granted_scopes: string;
  granted_at: string;
  updated_at: string;
};

const REQUIRE_EXPLICIT_CONSENT = /^(1|true|yes)$/i.test(
  process.env.REQUIRE_EXPLICIT_CONSENT || ""
);

export function isExplicitConsentRequired(): boolean {
  return REQUIRE_EXPLICIT_CONSENT;
}

export function getDeviceConsent(deviceId: string): DeviceConsentRow | null {
  return (getDeviceConsentById.get(deviceId) as DeviceConsentRow | undefined) || null;
}

export function canReportActivity(deviceId: string): boolean {
  if (!REQUIRE_EXPLICIT_CONSENT) return true;
  const consent = getDeviceConsent(deviceId);
  return !!consent && consent.activity_reporting === 1;
}

export function canReportHealth(deviceId: string): boolean {
  if (!REQUIRE_EXPLICIT_CONSENT) return true;
  const consent = getDeviceConsent(deviceId);
  return !!consent && consent.health_reporting === 1;
}

export function cleanupUnconfiguredDeviceData(allowedDeviceIds: string[]): {
  deviceStatesDeleted: number;
  activitiesDeleted: number;
  healthRecordsDeleted: number;
} {
  if (allowedDeviceIds.length === 0) {
    return {
      deviceStatesDeleted: 0,
      activitiesDeleted: 0,
      healthRecordsDeleted: 0,
    };
  }

  const placeholders = allowedDeviceIds.map(() => "?").join(", ");

  const deleteDeviceStates = db.prepare(
    `DELETE FROM device_states WHERE device_id NOT IN (${placeholders})`
  );
  const deleteActivities = db.prepare(
    `DELETE FROM activities WHERE device_id NOT IN (${placeholders})`
  );
  const deleteHealthRecords = db.prepare(
    `DELETE FROM health_records WHERE device_id NOT IN (${placeholders})`
  );

  const tx = db.transaction((ids: string[]) => {
    const deviceStatesDeleted = deleteDeviceStates.run(...ids).changes;
    const activitiesDeleted = deleteActivities.run(...ids).changes;
    const healthRecordsDeleted = deleteHealthRecords.run(...ids).changes;
    return { deviceStatesDeleted, activitiesDeleted, healthRecordsDeleted };
  });

  return tx(allowedDeviceIds);
}

export default db;
