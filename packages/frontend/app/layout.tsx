import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monika Now",
  description: "What is Monika doing right now?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  );
}
