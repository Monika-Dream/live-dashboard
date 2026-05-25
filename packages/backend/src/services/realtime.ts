import { db } from "../db";
import { authenticateToken } from "../middleware/auth";
import type { DeviceInfo } from "../types";
import type { ServerWebSocket } from "bun";

type Role = "viewer" | "device";

export interface WsData {
  role: Role;
  id: string;
  device?: DeviceInfo;
}

const MAX_TEXT_LENGTH = 500;
const MESSAGE_TTL_MINUTES = 30;
const VIEWER_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const deviceSockets = new Map<string, ServerWebSocket<WsData>>();
const viewerSockets = new Map<string, ServerWebSocket<WsData>>();
const viewerRate = new Map<string, { count: number; resetAt: number }>();

const insertQueuedMessage = db.prepare(`
  INSERT INTO device_messages (id, device_id, viewer_id, text, expires_at)
  VALUES (?, ?, ?, ?, datetime('now', ?))
`);

const getPendingMessages = db.prepare(`
  SELECT id, viewer_id, text, created_at
  FROM device_messages
  WHERE device_id = ?
    AND delivered_at = ''
    AND datetime(expires_at) >= datetime('now')
  ORDER BY created_at ASC
  LIMIT 20
`);

const markMessageDelivered = db.prepare(`
  UPDATE device_messages
  SET delivered_at = datetime('now')
  WHERE id = ? AND device_id = ?
`);

const markMessagesDelivered = db.transaction((deviceId: string, ids: string[]) => {
  for (const id of ids) markMessageDelivered.run(id, deviceId);
});

const markMessageReplied = db.prepare(`
  UPDATE device_messages
  SET replied_at = datetime('now')
  WHERE id = ?
`);

function send(ws: ServerWebSocket<WsData>, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function parseJson(raw: string | Buffer): any | null {
  try {
    return JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
  } catch {
    return null;
  }
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_TEXT_LENGTH);
}

function rateLimit(viewerId: string): boolean {
  const now = Date.now();
  const current = viewerRate.get(viewerId);
  if (!current || current.resetAt <= now) {
    viewerRate.set(viewerId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= VIEWER_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function queueMessage(deviceId: string, viewerId: string, text: string, messageId: string) {
  try {
    insertQueuedMessage.run(
      messageId,
      deviceId,
      viewerId,
      text,
      `+${MESSAGE_TTL_MINUTES} minutes`
    );
  } catch {
    // Duplicate client-supplied message ids are ignored; the sender still gets an ack.
  }
}

function deliverQueuedMessages(deviceId: string, ws: ServerWebSocket<WsData>) {
  const rows = getPendingMessages.all(deviceId) as {
    id: string;
    viewer_id: string;
    text: string;
    created_at: string;
  }[];
  if (rows.length === 0) return;

  for (const row of rows) {
    send(ws, {
      type: "viewer_message",
      message_id: row.id,
      viewer_id: row.viewer_id,
      text: row.text,
      created_at: row.created_at,
      queued: true,
    });
  }
  markMessagesDelivered(deviceId, rows.map((r) => r.id));
}

export function getWsInfo(req: Request): WsData | Response {
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  if (role === "device") {
    const device = authenticateToken(req.headers.get("authorization"));
    if (!device) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return { role: "device", id: device.device_id, device };
  }

  if (role === "viewer") {
    const viewerId = crypto.randomUUID();
    return { role: "viewer", id: viewerId };
  }

  return Response.json({ error: "role must be viewer or device" }, { status: 400 });
}

export const realtimeWebSocket = {
  open(ws: ServerWebSocket<WsData>) {
    if (ws.data.role === "device") {
      deviceSockets.set(ws.data.id, ws);
      send(ws, { type: "ack", status: "connected", role: "device", device_id: ws.data.id });
      deliverQueuedMessages(ws.data.id, ws);
      return;
    }
    viewerSockets.set(ws.data.id, ws);
    send(ws, { type: "ack", status: "connected", role: "viewer", viewer_id: ws.data.id });
  },

  message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
    const data = parseJson(raw);
    if (!data || typeof data.type !== "string") {
      send(ws, { type: "error", error: "Invalid JSON" });
      return;
    }

    if (ws.data.role === "viewer" && data.type === "viewer_message") {
      if (!rateLimit(ws.data.id)) {
        send(ws, { type: "error", error: "Rate limit exceeded" });
        return;
      }

      const targetDeviceId = typeof data.target_device_id === "string" ? data.target_device_id : "";
      const text = cleanText(data.text);
      const messageId = typeof data.message_id === "string" && data.message_id
        ? data.message_id.slice(0, 80)
        : crypto.randomUUID();
      if (!targetDeviceId || !text) {
        send(ws, { type: "error", message_id: messageId, error: "target_device_id and text required" });
        return;
      }

      const deviceWs = deviceSockets.get(targetDeviceId);
      if (deviceWs) {
        send(deviceWs, {
          type: "viewer_message",
          message_id: messageId,
          viewer_id: ws.data.id,
          text,
          created_at: new Date().toISOString(),
        });
        send(ws, { type: "ack", message_id: messageId, status: "sent" });
      } else {
        queueMessage(targetDeviceId, ws.data.id, text, messageId);
        send(ws, { type: "ack", message_id: messageId, status: "queued" });
      }
      return;
    }

    if (ws.data.role === "device" && data.type === "device_reply") {
      const targetViewerId = typeof data.target_viewer_id === "string" ? data.target_viewer_id : "";
      const text = cleanText(data.text);
      const messageId = typeof data.message_id === "string" ? data.message_id.slice(0, 80) : "";
      if (!targetViewerId || !text) {
        send(ws, { type: "error", message_id: messageId, error: "target_viewer_id and text required" });
        return;
      }
      if (messageId) markMessageReplied.run(messageId);
      const viewerWs = viewerSockets.get(targetViewerId);
      if (viewerWs) {
        send(viewerWs, {
          type: "device_reply",
          message_id: messageId,
          device_id: ws.data.id,
          text,
          created_at: new Date().toISOString(),
        });
      }
      send(ws, { type: "ack", message_id: messageId, status: "reply_sent" });
      return;
    }

    if (ws.data.role === "device" && data.type === "device_status") {
      send(ws, { type: "ack", status: "status_received" });
      return;
    }

    send(ws, { type: "error", error: "Unsupported message type" });
  },

  close(ws: ServerWebSocket<WsData>) {
    if (ws.data.role === "device") {
      if (deviceSockets.get(ws.data.id) === ws) deviceSockets.delete(ws.data.id);
    } else if (viewerSockets.get(ws.data.id) === ws) {
      viewerSockets.delete(ws.data.id);
    }
  },
};

export function handleDeviceMessages(req: Request): Response {
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = getPendingMessages.all(device.device_id) as {
    id: string;
    viewer_id: string;
    text: string;
    created_at: string;
  }[];
  if (rows.length > 0) {
    markMessagesDelivered(device.device_id, rows.map((r) => r.id));
  }
  return Response.json({ messages: rows });
}

export async function handleDeviceMessageReply(req: Request): Promise<Response> {
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const viewerId = typeof body.target_viewer_id === "string" ? body.target_viewer_id : "";
  const messageId = typeof body.message_id === "string" ? body.message_id.slice(0, 80) : "";
  const text = cleanText(body.text);
  if (!viewerId || !text) {
    return Response.json({ error: "target_viewer_id and text required" }, { status: 400 });
  }

  if (messageId) markMessageReplied.run(messageId);
  const viewerWs = viewerSockets.get(viewerId);
  if (viewerWs) {
    send(viewerWs, {
      type: "device_reply",
      message_id: messageId,
      device_id: device.device_id,
      text,
      created_at: new Date().toISOString(),
    });
  }

  return Response.json({ ok: true, delivered: Boolean(viewerWs) });
}
