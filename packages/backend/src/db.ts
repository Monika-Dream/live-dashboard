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
