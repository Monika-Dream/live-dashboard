"use client";

import { useEffect } from "react";
import { useConfig } from "@/hooks/useConfig";

function setMeta(selector: string, content: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) {
    element.setAttribute("content", content);
    return;
  }

  const meta = document.createElement("meta");
  if (selector.startsWith('meta[name="')) {
    const name = selector.match(/^meta\[name="([^"]+)"\]$/)?.[1];
    if (name) meta.setAttribute("name", name);
  } else if (selector.startsWith('meta[property="')) {
    const property = selector.match(/^meta\[property="([^"]+)"\]$/)?.[1];
    if (property) meta.setAttribute("property", property);
  }
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

function setFavicon(href: string) {
  const selectors = ['link[rel="icon"]', 'link[rel="shortcut icon"]'];
  let updated = false;

  for (const selector of selectors) {
    const link = document.head.querySelector<HTMLLinkElement>(selector);
    if (link) {
      link.setAttribute("href", href);
      updated = true;
    }
  }

  if (!updated) {
    const link = document.createElement("link");
    link.setAttribute("rel", "icon");
    link.setAttribute("href", href);
    document.head.appendChild(link);
  }
}

export default function SiteMetadataSync() {
  const { siteTitle, siteDescription, siteFavicon } = useConfig();

  useEffect(() => {
    document.title = siteTitle;
    setMeta('meta[name="description"]', siteDescription);
    setMeta('meta[property="og:title"]', siteTitle);
    setMeta('meta[property="og:description"]', siteDescription);
    setMeta('meta[name="twitter:title"]', siteTitle);
    setMeta('meta[name="twitter:description"]', siteDescription);
    setFavicon(siteFavicon);
  }, [siteTitle, siteDescription, siteFavicon]);

  return null;
}
