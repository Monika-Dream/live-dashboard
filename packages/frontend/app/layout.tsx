import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Isabelle Now",
  description: "What is Isabelle doing right now?",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--color-cream)] relative overflow-x-hidden">
        {/* Sakura petal layer */}
        <div className="sakura-container" aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className={`sakura-petal sakura-petal-${i}`} />
          ))}
        </div>

        <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
