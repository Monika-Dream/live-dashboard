import type { Metadata } from "next";
import "./globals.css";

const DISPLAY_NAME_PLACEHOLDER = "__LIVE_DASHBOARD_DISPLAY_NAME__";
const SITE_TITLE_PLACEHOLDER = "__LIVE_DASHBOARD_SITE_TITLE__";
const SITE_DESCRIPTION_PLACEHOLDER = "__LIVE_DASHBOARD_SITE_DESCRIPTION__";
const SITE_FAVICON_PLACEHOLDER = "/__LIVE_DASHBOARD_SITE_FAVICON__";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: SITE_TITLE_PLACEHOLDER,
    description: SITE_DESCRIPTION_PLACEHOLDER,
    icons: { icon: SITE_FAVICON_PLACEHOLDER },
    openGraph: {
      title: SITE_TITLE_PLACEHOLDER,
      description: SITE_DESCRIPTION_PLACEHOLDER,
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-display-name={DISPLAY_NAME_PLACEHOLDER}>
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
