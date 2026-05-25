"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceState } from "@/lib/api";
import { getRealtimeUrl } from "@/lib/api";

interface Props {
  device?: DeviceState;
}

interface ChatLine {
  id: string;
  from: "viewer" | "device" | "system";
  text: string;
  status?: string;
}

export default function VisitorMessages({ device }: Props) {
  const [connected, setConnected] = useState(false);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const ws = new WebSocket(getRealtimeUrl());
      socketRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => setConnected(false);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ack" && data.message_id) {
            setLines((prev) => prev.map((line) =>
              line.id === data.message_id ? { ...line, status: data.status } : line
            ));
          } else if (data.type === "device_reply") {
            setLines((prev) => [...prev, {
              id: data.message_id || crypto.randomUUID(),
              from: "device",
              text: typeof data.text === "string" ? data.text : "",
            }]);
          } else if (data.type === "error") {
            setLines((prev) => [...prev, {
              id: crypto.randomUUID(),
              from: "system",
              text: typeof data.error === "string" ? data.error : "发送失败",
            }]);
          }
        } catch {
          // Ignore malformed realtime frames.
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  const statusText = useMemo(() => {
    if (!device) return "未选择设备";
    if (!connected) return "连接中";
    return device.is_online === 1 ? "可实时发送" : "设备离线，将短暂排队";
  }, [connected, device]);

  const send = () => {
    const cleaned = text.trim();
    if (!device || !cleaned || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    socketRef.current.send(JSON.stringify({
      type: "viewer_message",
      message_id: id,
      target_device_id: device.device_id,
      text: cleaned,
    }));
    setLines((prev) => [...prev, { id, from: "viewer", text: cleaned, status: "sending" }]);
    setText("");
  };

  return (
    <section className="vn-bubble mt-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
          Message
        </h2>
        <span className="text-[10px] text-[var(--color-text-muted)]">{statusText}</span>
      </div>

      {lines.length > 0 && (
        <div className="mb-3 max-h-40 overflow-auto space-y-1 text-xs">
          {lines.slice(-8).map((line) => (
            <div
              key={line.id}
              className={
                line.from === "viewer"
                  ? "text-right"
                  : line.from === "device"
                    ? "text-left"
                    : "text-center text-[var(--color-text-muted)]"
              }
            >
              <span className="inline-block max-w-full rounded px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)]">
                {line.text}
                {line.status && (
                  <span className="ml-2 text-[10px] text-[var(--color-text-muted)]">
                    {line.status}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          disabled={!device || !connected}
          className="flex-1 min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none"
          placeholder={device ? "给手机发一条消息" : "请选择设备"}
        />
        <button
          onClick={send}
          disabled={!device || !connected || !text.trim()}
          className="pill-btn px-3 py-2 text-xs disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </section>
  );
}
