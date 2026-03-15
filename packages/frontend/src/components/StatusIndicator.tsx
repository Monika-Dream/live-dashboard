export default function StatusIndicator({ online }: { online: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        backgroundColor: online ? "var(--color-secondary)" : "var(--color-border)",
        boxShadow: online ? "0 0 6px var(--color-secondary)" : "none",
      }}
      title={online ? "Online" : "Offline"}
    />
  );
}
