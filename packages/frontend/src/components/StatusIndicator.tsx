export default function StatusIndicator({ online }: { online: boolean }) {
  return (
    <span
      className={`device-dot ${online ? "online" : "offline"}`}
      title={online ? "Online" : "Offline"}
    />
  );
}
