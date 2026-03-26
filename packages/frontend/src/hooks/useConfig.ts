"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchConfig, defaultConfig } from "@/lib/api";
import type { SiteConfig } from "@/lib/api";

const ConfigContext = createContext<SiteConfig>(defaultConfig);
const PLACEHOLDER_PREFIX = "__LIVE_DASHBOARD_";

function readDocumentValue(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX)) {
    return fallback;
  }
  return trimmed;
}

function getInitialConfig(): SiteConfig {
  if (typeof document === "undefined") {
    return defaultConfig;
  }

  const displayName = readDocumentValue(
    document.documentElement.getAttribute("data-display-name"),
    defaultConfig.displayName,
  );
  const siteTitle = readDocumentValue(document.title, defaultConfig.siteTitle);
  const siteDescription = readDocumentValue(
    document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
    defaultConfig.siteDescription,
  );
  const siteFavicon = readDocumentValue(
    document.head
      .querySelector<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
      ?.getAttribute("href"),
    defaultConfig.siteFavicon,
  );

  return {
    ...defaultConfig,
    displayName,
    siteTitle,
    siteDescription,
    siteFavicon,
  };
}

export function useConfig() {
  return useContext(ConfigContext);
}

export { ConfigContext };

export function useConfigLoader(): SiteConfig {
  const [config, setConfig] = useState<SiteConfig>(() => getInitialConfig());

  useEffect(() => {
    const controller = new AbortController();
    fetchConfig(controller.signal)
      .then((nextConfig) => {
        if (!controller.signal.aborted) setConfig(nextConfig);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return config;
}
