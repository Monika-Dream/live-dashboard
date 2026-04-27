import { timingSafeEqual } from "node:crypto";

function normalizeEnvSecret(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";

  // Docker Compose users sometimes wrap .env values in quotes by habit.
  const unquoted = trimmed.replace(/^(['"])(.*)\1$/, "$2").trim();
  return unquoted.replace(/^\uFEFF/, "");
}

const ADMIN_PASSWORD = normalizeEnvSecret(process.env.ADMIN_PASSWORD);
const ADMIN_TOKEN = normalizeEnvSecret(process.env.ADMIN_TOKEN);
const ADMIN_SECRETS = Array.from(new Set([ADMIN_PASSWORD, ADMIN_TOKEN].filter(Boolean)));

if (ADMIN_PASSWORD && ADMIN_TOKEN && ADMIN_PASSWORD !== ADMIN_TOKEN) {
  console.warn("[admin] ADMIN_PASSWORD and ADMIN_TOKEN differ; both are accepted for compatibility.");
}

function readToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  return (req.headers.get("x-admin-token") || "").trim();
}

export function ensureAdminAuthorized(req: Request): Response | null {
  if (ADMIN_SECRETS.length === 0) {
    return Response.json(
      { error: "ADMIN_PASSWORD / ADMIN_TOKEN not configured on server" },
      { status: 503 },
    );
  }

  const token = readToken(req);
  const isAuthorized = token
    ? ADMIN_SECRETS.some((secret) => safeEqual(token, secret))
    : false;

  if (!isAuthorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
