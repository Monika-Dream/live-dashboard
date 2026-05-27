import type { ServerWebSocket } from "bun";
import { authenticateRawToken } from "../middleware/auth";
import { processReportBody } from "../routes/report";
import type { DeviceInfo } from "../types";

/**
 * WebSocket server for real-time communication between devices and viewers.
 *
 * Protocol:
 *   - Devices connect: /api/ws?role=device with Authorization header
 *   - Viewers connect: /api/ws?role=viewer (no auth required)
 *
 * Message types (device → server):
 *   - { type: "device_status", payload: { app_id, window_title, ... } }
 *
 * Message types (viewer → server):
 *   - { type: "viewer_message", text, viewer_id?, viewer_name?, kind? }
 *
 * Message types (server → device):
 *   - { type: "viewer_message", text, message_id, viewer_id, viewer_name, kind }
 *
 * Message types (server → viewer):
 *   - { type: "device_update", device_id, device_name, app_id, app_name, display_title, extra, is_online }
 */

interface WSData {
  role: "device" | "viewer";
  device?: DeviceInfo;
  connectedAt: number;
}

// Track connected devices for broadcasting updates to viewers
const deviceConnections = new Map<string, DeviceInfo>();

// Track viewer count
let viewerCount = 0;

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function handleWebSocketUpgrade(
  req: Request,
  upgrade: (options?: { data?: WSData; headers?: Record<string, string> }) => boolean
): Response | void {
  const url = new URL(req.url);
  if (url.pathname !== "/api/ws") return undefined;

  const role = url.searchParams.get("role") || "viewer";

  if (role === "device") {
    // Authenticate device connections
    const authHeader = req.headers.get("authorization");
    let token = "";
    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match) token = match[1];
    }
    // Also support token as query param (for LSPosed module compatibility)
    if (!token) {
      token = url.searchParams.get("token") || "";
    }

    const device = authenticateRawToken(token);
    if (!device) {
      return new Response("Unauthorized", { status: 401 });
    }

    upgrade({
      data: { role: "device", device, connectedAt: Date.now() },
    });
    return; // upgrade handled
  }

  if (role === "viewer") {
    upgrade({
      data: { role: "viewer", connectedAt: Date.now() },
    });
    return;
  }

  return new Response("Bad request: invalid role", { status: 400 });
}

export const websocketHandlers = {
  open(ws: ServerWebSocket<WSData>) {
    const data = ws.data;

    if (data.role === "device" && data.device) {
      const dev = data.device;
      deviceConnections.set(dev.device_id, dev);
      ws.subscribe("viewers"); // subscribe to viewer messages
      console.log(`[ws] Device connected: ${dev.device_name} (${dev.device_id})`);

      // Broadcast device online to all viewers
      ws.publish("viewer_updates", JSON.stringify({
        type: "device_online",
        device_id: dev.device_id,
        device_name: dev.device_name,
        platform: dev.platform,
      }));
    } else if (data.role === "viewer") {
      viewerCount++;
      ws.subscribe("viewer_updates"); // subscribe to device state updates
      ws.subscribe("viewer_messages_out"); // receive messages to forward to devices
      console.log(`[ws] Viewer connected (total: ${viewerCount})`);

      // Send current device states to new viewer
      const states: Array<DeviceInfo> = [];
      deviceConnections.forEach((dev) => states.push(dev));
      ws.send(JSON.stringify({
        type: "device_list",
        devices: states.map(d => ({
          device_id: d.device_id,
          device_name: d.device_name,
          platform: d.platform,
          is_online: true,
        })),
        viewer_count: viewerCount,
      }));
    }
  },

  async message(ws: ServerWebSocket<WSData>, rawMessage: string | Buffer) {
    const data = ws.data;
    const text = typeof rawMessage === "string" ? rawMessage : rawMessage.toString();

    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (data.role === "device" && data.device) {
      await handleDeviceMessage(ws, data.device, msg);
    } else if (data.role === "viewer") {
      handleViewerMessage(ws, msg);
    }
  },

  close(ws: ServerWebSocket<WSData>, code: number, reason: string) {
    const data = ws.data;

    if (data.role === "device" && data.device) {
      const dev = data.device;
      deviceConnections.delete(dev.device_id);
      console.log(`[ws] Device disconnected: ${dev.device_name} (${code}: ${reason})`);

      // Broadcast device offline to all viewers
      ws.publish("viewer_updates", JSON.stringify({
        type: "device_offline",
        device_id: dev.device_id,
        device_name: dev.device_name,
      }));
    } else if (data.role === "viewer") {
      viewerCount = Math.max(0, viewerCount - 1);
      console.log(`[ws] Viewer disconnected (total: ${viewerCount}, code: ${code})`);
    }
  },

  drain(_ws: ServerWebSocket<WSData>) {
    // Backpressure handled automatically by Bun
  },
};

async function handleDeviceMessage(
  ws: ServerWebSocket<WSData>,
  device: DeviceInfo,
  msg: any
): Promise<void> {
  const type = msg.type;

  if (type === "device_status") {
    // Process exactly like HTTP /api/report
    const payload = msg.payload;
    if (!payload || typeof payload !== "object") {
      ws.send(JSON.stringify({ type: "ack", ok: false, error: "payload required" }));
      return;
    }

    const result = processReportBody(payload, device);
    ws.send(JSON.stringify({ type: "ack", ok: result.ok, error: result.error }));

    if (result.ok) {
      // Broadcast updated state to all viewers
      ws.publish("viewer_updates", JSON.stringify({
        type: "device_update",
        device_id: device.device_id,
        device_name: device.device_name,
        platform: device.platform,
        app_id: payload.app_id || "",
        display_title: "", // privacy: do not expose via WS
        is_online: true,
        timestamp: new Date().toISOString(),
      }));
    }
    return;
  }

  if (type === "ping") {
    ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
    return;
  }

  ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${type}` }));
}

function handleViewerMessage(ws: ServerWebSocket<WSData>, msg: any): void {
  const type = msg.type;

  if (type === "viewer_message") {
    const text = typeof msg.text === "string" ? msg.text.slice(0, 500) : "";
    if (!text) {
      ws.send(JSON.stringify({ type: "ack", ok: false, error: "text required" }));
      return;
    }

    const viewerId = typeof msg.viewer_id === "string" ? msg.viewer_id : "";
    const viewerName = typeof msg.viewer_name === "string" ? msg.viewer_name : "";
    const kind = typeof msg.kind === "string" ? msg.kind : "private";
    const messageId = generateMessageId();

    // Forward to all connected devices
    ws.publish("viewers", JSON.stringify({
      type: "viewer_message",
      text,
      message_id: messageId,
      viewer_id: viewerId,
      viewer_name: viewerName,
      kind,
      timestamp: new Date().toISOString(),
    }));

    // Acknowledge to sender
    ws.send(JSON.stringify({ type: "ack", ok: true, message_id: messageId }));
    return;
  }

  if (type === "ping") {
    ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
    return;
  }

  ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${type}` }));
}

export function getWebSocketStats() {
  return {
    devices: deviceConnections.size,
    viewers: viewerCount,
  };
}
