import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monika Now",
  description: "What is Monika doing right now?",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--color-bg)] relative overflow-x-hidden">
        {/* Corner decorations */}
        <div className="corner-deco top-right" aria-hidden="true">✦</div>
        <div className="corner-deco bottom-left" aria-hidden="true">✦</div>

        <main className="relative z-10 max-w-lg mx-auto px-5 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
