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
import { handleAdminVerify, handleConfig, handleDashboardCreate, handleDashboardDelete } from "./routes/config";
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

const PORT = parseInt(process.env.PORT || "3000", 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[server] Invalid PORT: ${process.env.PORT}, using 3000`);
}
const LISTEN_PORT = isNaN(PORT) || PORT < 1 || PORT > 65535 ? 3000 : PORT;

const STATIC_ROOT = resolve(process.env.STATIC_DIR || "./public");

// Cache realpath of static root at startup (avoids per-request sync IO)
let REAL_STATIC_ROOT = "";
let staticEnabled = false;
try {
  REAL_STATIC_ROOT = realpathSync(STATIC_ROOT);
  staticEnabled = true;
} catch {
  console.warn(`[server] Static dir not found: ${STATIC_ROOT} — static files won't be served`);
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

const server = Bun.serve({
  port: LISTEN_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // CORS headers for development
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API routes
    let response: Response;

    try {
      if (pathname === "/api/report" && req.method === "POST") {
        response = await handleReport(req);
      } else if (pathname === "/api/current" && req.method === "GET") {
        const clientIp =
          req.headers.get("x-real-ip") ||
          req.headers.get("cf-connecting-ip") ||
          server.requestIP(req)?.address ||
          "";
        response = handleCurrent(clientIp, req.headers.get("user-agent") || undefined);
      } else if (pathname === "/api/timeline" && req.method === "GET") {
        response = handleTimeline(url);
      } else if (pathname === "/api/health" && req.method === "GET") {
        response = handleHealth();
      } else if (pathname === "/api/health-data" && req.method === "POST") {
        response = await handleHealthData(req);
      } else if (pathname === "/api/health-data" && req.method === "GET") {
        response = handleHealthDataQuery(url);
      } else if (pathname === "/api/health-webhook" && req.method === "POST") {
        response = await handleHealthWebhook(req);
      } else if (pathname === "/api/consent" && req.method === "GET") {
        response = handleConsentGet(req);
      } else if (pathname === "/api/consent" && req.method === "POST") {
        response = await handleConsentPost(req);
      } else if (pathname === "/api/config" && req.method === "GET") {
        response = handleConfig();
      } else if (pathname === "/api/config/verify" && req.method === "POST") {
        response = handleAdminVerify(req);
      } else if (pathname === "/api/config/dashboards" && req.method === "POST") {
        response = await handleDashboardCreate(req);
      } else if (pathname === "/api/config/dashboards" && req.method === "DELETE") {
        response = await handleDashboardDelete(req);
      } else if (pathname === "/api/proxy" && req.method === "GET") {
        response = await handleProxy(url);
      } else if (!pathname.startsWith("/api/")) {
        // Static file serving disabled if directory doesn't exist
        if (!staticEnabled) {
          response = Response.json({ error: "Not found" }, { status: 404 });
        } else {
          // Path traversal + symlink protection
          let decoded: string;
          try {
            decoded = decodeURIComponent(pathname);
          } catch {
            return new Response("Bad request", { status: 400 });
          }
          const safePath = normalize(decoded).replace(/^(\.\.[\/\\])+/, "");
          const resolved = resolve(STATIC_ROOT, safePath.replace(/^[\/\\]+/, ""));

          // Quick check: relative path must not escape root
          const rel = relative(STATIC_ROOT, resolved);
          if (rel.startsWith("..")) {
            response = Response.json({ error: "Forbidden" }, { status: 403 });
          } else {
            // Resolve symlinks and verify the real path is under root, then serve
            try {
              const realFile = await realpathAsync(resolved);
              if (realFile !== REAL_STATIC_ROOT && !realFile.startsWith(REAL_STATIC_ROOT + sep)) {
                response = Response.json({ error: "Forbidden" }, { status: 403 });
              } else {
                // Serve from the resolved real path
                const file = Bun.file(realFile);
                if (await file.exists()) {
                  return serveStaticFile(realFile);
                }
                // SPA fallback: file not found (or is a directory), serve index.html
                const indexFile = Bun.file(`${REAL_STATIC_ROOT}/index.html`);
                if (await indexFile.exists()) {
                  return serveStaticFile(`${REAL_STATIC_ROOT}/index.html`);
                }
                response = Response.json({ error: "Not found" }, { status: 404 });
              }
            } catch {
              // realpath fails if file doesn't exist — try SPA fallback
              const indexFile = Bun.file(`${REAL_STATIC_ROOT}/index.html`);
              if (await indexFile.exists()) {
                return serveStaticFile(`${REAL_STATIC_ROOT}/index.html`);
              }
              response = Response.json({ error: "Not found" }, { status: 404 });
            }
          }
        }
      } else {
        response = Response.json({ error: "Not found" }, { status: 404 });
      }
    } catch (e) {
      console.error("[server] Unhandled error:", e);
      response = Response.json({ error: "Internal error" }, { status: 500 });
    }

    // Append CORS headers to API responses
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  },
});

console.log(`[server] Live Dashboard backend running on http://localhost:${server.port}`);
