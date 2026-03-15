import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monika Now",
  description: "What is Monika doing right now?",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[var(--color-cream)] relative overflow-x-hidden">
        {/* Particle layer */}
        <div className="sakura-container" aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className={`sakura-petal sakura-petal-${i}`} />
          ))}
        </div>

        <main className="relative z-10 max-w-3xl mx-auto px-5 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
