import type { Metadata } from "next";
import "./globals.css";

const DISPLAY_NAME_PLACEHOLDER = "__LIVE_DASHBOARD_DISPLAY_NAME__";
const SITE_TITLE_PLACEHOLDER = "__LIVE_DASHBOARD_SITE_TITLE__";
const SITE_DESCRIPTION_PLACEHOLDER = "__LIVE_DASHBOARD_SITE_DESCRIPTION__";
const SITE_FAVICON_PLACEHOLDER = "/__LIVE_DASHBOARD_SITE_FAVICON__";

// fonts.googleapis.com is blocked/unreachable in mainland China, and because it
// was loaded via a render-blocking @import in globals.css it stalled first paint.
// Self-hosting would need dozens of CJK subset files, so instead we load the
// equivalent @fontsource CSS (same family names / weights / unicode-range
// subsets as the original css2 request) from jsDelivr, which has mainland-CN
// acceleration nodes. font-display: swap in those stylesheets keeps text
// readable while the webfonts load.
const FONT_STYLESHEETS = [
  "https://cdn.jsdelivr.net/npm/@fontsource/zen-maru-gothic@5.3.0/400.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/zen-maru-gothic@5.3.0/500.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/zen-maru-gothic@5.3.0/700.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/quicksand@5.3.0/400.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/quicksand@5.3.0/500.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/quicksand@5.3.0/600.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/quicksand@5.3.0/700.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/400.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/500.css",
] as const;

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
        {/* Webfont stylesheets (React hoists <link> into <head>) */}
        {FONT_STYLESHEETS.map((href) => (
          <link key={href} rel="stylesheet" href={href} precedence="high" />
        ))}

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
