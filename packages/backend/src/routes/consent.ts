import { authenticateToken } from "../middleware/auth";
import { getDeviceConsent, isExplicitConsentRequired, upsertDeviceConsent } from "../db";

const MAX_SCOPES = 16;
const MAX_SCOPE_LENGTH = 64;

function sanitizeScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const unique = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const scope = item.trim();
    if (!scope || scope.length > MAX_SCOPE_LENGTH) continue;
    unique.add(scope);
    if (unique.size >= MAX_SCOPES) break;
  }

  return Array.from(unique);
}

function parseStoredScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return sanitizeScopes(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function handleConsentGet(req: Request): Response {
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const consent = getDeviceConsent(device.device_id);
  return Response.json({
    required: isExplicitConsentRequired(),
    consent: consent
      ? {
          consent_version: consent.consent_version,
          activity_reporting: consent.activity_reporting === 1,
          health_reporting: consent.health_reporting === 1,
          granted_scopes: parseStoredScopes(consent.granted_scopes),
          granted_at: consent.granted_at,
          updated_at: consent.updated_at,
        }
      : null,
  });
}

export async function handleConsentPost(req: Request): Promise<Response> {
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = getDeviceConsent(device.device_id);

  const hasActivity = typeof body.activity_reporting === "boolean";
  const hasHealth = typeof body.health_reporting === "boolean";

  if (!hasActivity && !hasHealth && !Array.isArray(body.granted_scopes)) {
    return Response.json(
      { error: "At least one of activity_reporting, health_reporting, granted_scopes is required" },
      { status: 400 }
    );
  }

  const activityReporting = hasActivity
    ? (body.activity_reporting ? 1 : 0)
    : existing?.activity_reporting || 0;
  const healthReporting = hasHealth
    ? (body.health_reporting ? 1 : 0)
    : existing?.health_reporting || 0;

  let consentVersion = existing?.consent_version || 1;
  if (typeof body.consent_version === "number" && Number.isInteger(body.consent_version)) {
    if (body.consent_version < 1 || body.consent_version > 9999) {
      return Response.json({ error: "consent_version out of range" }, { status: 400 });
    }
    consentVersion = body.consent_version;
  }

  const grantedScopes = Array.isArray(body.granted_scopes)
    ? sanitizeScopes(body.granted_scopes)
    : parseStoredScopes(existing?.granted_scopes);

  const now = new Date().toISOString();
  const grantedAt = existing?.granted_at || now;

  try {
    upsertDeviceConsent.run(
      device.device_id,
      consentVersion,
      activityReporting,
      healthReporting,
      JSON.stringify(grantedScopes),
      grantedAt,
      now
    );
  } catch (e: any) {
    console.error("[consent] DB error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    required: isExplicitConsentRequired(),
    consent: {
      consent_version: consentVersion,
      activity_reporting: activityReporting === 1,
      health_reporting: healthReporting === 1,
      granted_scopes: grantedScopes,
      granted_at: grantedAt,
      updated_at: now,
    },
  });
}
