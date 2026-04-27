import { resolve, normalize, relative, sep } from "node:path";
import { realpathSync } from "node:fs";
import { realpath as realpathAsync } from "node:fs/promises";
import { handleReport } from "./routes/report";
import { handleCurrent } from "./routes/current";
import { handleTimeline } from "./routes/timeline";
import { handleHealth } from "./routes/health";
import { handleHealthData, handleHealthDataQuery } from "./routes/health-data";
import { handleHealthWebhook } from "./routes/health-webhook";
import { handleConsentGet, handleConsentPost } from "./routes/consent";
import {
  handleAdminConfigGet,
  handleAdminDeviceDelete,
  handleAdminDeviceUpsert,
  handleAdminSiteUpdate,
  handleAdminVerify,
  handleConfig,
  handleDashboardCreate,
  handleDashboardDelete,
} from "./routes/config";
import { handleProxy } from "./routes/proxy";
import { injectSiteConfig } from "./services/site-config";
import { cleanupUnconfiguredDeviceData } from "./db";
import { getConfiguredDeviceIds } from "./middleware/auth";

// Start scheduled cleanup tasks (import triggers setInterval registration)
import "./services/cleanup";

const configuredDeviceIds = getConfiguredDeviceIds();
if (configuredDeviceIds.length > 0) {
  const cleaned = cleanupUnconfiguredDeviceData(configuredDeviceIds);
  const totalCleaned =
    cleaned.deviceStatesDeleted + cleaned.activitiesDeleted + cleaned.healthRecordsDeleted;
  if (totalCleaned > 0) {
    console.log(
      `[cleanup] Removed stale records: device_states=${cleaned.deviceStatesDeleted}, activities=${cleaned.activitiesDeleted}, health_records=${cleaned.healthRecordsDeleted}`
    );
  }
}

function normalizePort(rawValue: string | undefined, fallback: number, envName: string): number {
  const parsed = parseInt(rawValue || String(fallback), 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`[server] Invalid ${envName}: ${rawValue}, using ${fallback}`);
    return fallback;
  }
  return parsed;
}

const LISTEN_PORT = normalizePort(process.env.PORT, 3000, "PORT");
const adminPortRaw = normalizePort(process.env.ADMIN_PORT, 3001, "ADMIN_PORT");
const ADMIN_LISTEN_PORT =
  adminPortRaw === LISTEN_PORT
    ? LISTEN_PORT === 65535
      ? 3001
      : LISTEN_PORT + 1
    : adminPortRaw;
if (adminPortRaw === LISTEN_PORT) {
  console.warn(
    `[server] ADMIN_PORT (${adminPortRaw}) conflicts with PORT (${LISTEN_PORT}), using ${ADMIN_LISTEN_PORT} for admin server.`,
  );
}

const STATIC_ROOT = resolve(process.env.STATIC_DIR || "./public");
const ADMIN_STATIC_ROOT = resolve(process.env.ADMIN_STATIC_DIR || "./admin-public");

type StaticContext = {
  root: string;
  realRoot: string;
  enabled: boolean;
  label: string;
};

function createStaticContext(rootPath: string, label: string): StaticContext {
  try {
    const realRoot = realpathSync(rootPath);
    return {
      root: rootPath,
      realRoot,
      enabled: true,
      label,
    };
  } catch {
    console.warn(`[server] ${label} static dir not found: ${rootPath} — static files won't be served`);
    return {
      root: rootPath,
      realRoot: "",
      enabled: false,
      label,
    };
  }
}

async function serveStaticFile(realFile: string): Promise<Response> {
  if (realFile.endsWith(".html")) {
    const html = await Bun.file(realFile).text();
    return new Response(injectSiteConfig(html), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(Bun.file(realFile));
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function appendCorsHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

async function handleApiRequest(req: Request, url: URL): Promise<Response> {
  const { pathname } = url;

  if (pathname === "/api/report" && req.method === "POST") {
    return await handleReport(req);
  }
  if (pathname === "/api/current" && req.method === "GET") {
    const clientIp =
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "";
    return handleCurrent(clientIp, req.headers.get("user-agent") || undefined);
  }
  if (pathname === "/api/timeline" && req.method === "GET") {
    return handleTimeline(url);
  }
  if (pathname === "/api/health" && req.method === "GET") {
    return handleHealth();
  }
  if (pathname === "/api/health-data" && req.method === "POST") {
    return await handleHealthData(req);
  }
  if (pathname === "/api/health-data" && req.method === "GET") {
    return handleHealthDataQuery(url);
  }
  if (pathname === "/api/health-webhook" && req.method === "POST") {
    return await handleHealthWebhook(req);
  }
  if (pathname === "/api/consent" && req.method === "GET") {
    return handleConsentGet(req);
  }
  if (pathname === "/api/consent" && req.method === "POST") {
    return await handleConsentPost(req);
  }
  if (pathname === "/api/config" && req.method === "GET") {
    return handleConfig();
  }
  if (pathname === "/api/config/verify" && req.method === "POST") {
    return handleAdminVerify(req);
  }
  if (pathname === "/api/config/admin" && req.method === "GET") {
    return handleAdminConfigGet(req);
  }
  if (pathname === "/api/config/site" && req.method === "POST") {
    return await handleAdminSiteUpdate(req);
  }
  if (pathname === "/api/config/devices" && req.method === "POST") {
    return await handleAdminDeviceUpsert(req);
  }
  if (pathname === "/api/config/devices" && req.method === "DELETE") {
    return await handleAdminDeviceDelete(req);
  }
  if (pathname === "/api/config/dashboards" && req.method === "POST") {
    return await handleDashboardCreate(req);
  }
  if (pathname === "/api/config/dashboards" && req.method === "DELETE") {
    return await handleDashboardDelete(req);
  }
  if (pathname === "/api/proxy" && req.method === "GET") {
    return await handleProxy(url);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

async function handleStaticRequest(pathname: string, staticContext: StaticContext): Promise<Response> {
  if (!staticContext.enabled) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const safePath = normalize(decoded).replace(/^(\.\.[\/\\])+/, "");
  const resolved = resolve(staticContext.root, safePath.replace(/^[\/\\]+/, ""));

  const rel = relative(staticContext.root, resolved);
  if (rel.startsWith("..")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const realFile = await realpathAsync(resolved);
    if (realFile !== staticContext.realRoot && !realFile.startsWith(staticContext.realRoot + sep)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const file = Bun.file(realFile);
    if (await file.exists()) {
      return await serveStaticFile(realFile);
    }

    const indexPath = `${staticContext.realRoot}/index.html`;
    const indexFile = Bun.file(indexPath);
    if (await indexFile.exists()) {
      return await serveStaticFile(indexPath);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch {
    const indexPath = `${staticContext.realRoot}/index.html`;
    const indexFile = Bun.file(indexPath);
    if (await indexFile.exists()) {
      return await serveStaticFile(indexPath);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

function startServer(port: number, staticContext: StaticContext, label: string) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      let response: Response;
      try {
        if (pathname.startsWith("/api/")) {
          response = await handleApiRequest(req, url);
        } else {
          response = await handleStaticRequest(pathname, staticContext);
        }
      } catch (e) {
        console.error(`[server:${label}] Unhandled error:`, e);
        response = Response.json({ error: "Internal error" }, { status: 500 });
      }

      return appendCorsHeaders(response);
    },
  });

  console.log(`[server] ${label} running on http://localhost:${server.port}`);
  return server;
}

const dashboardStaticContext = createStaticContext(STATIC_ROOT, "dashboard");
const adminStaticContext = createStaticContext(ADMIN_STATIC_ROOT, "admin");

startServer(LISTEN_PORT, dashboardStaticContext, "dashboard app");
startServer(ADMIN_LISTEN_PORT, adminStaticContext, "admin app");
