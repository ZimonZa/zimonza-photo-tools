import type { MetadataRoute } from "next";
import { FORMAT_PAIRS, TOOLS } from "@/lib/formats";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/about", "/privacy", ...TOOLS.map((t) => t.href)];
  const pairRoutes = FORMAT_PAIRS.map((p) => `/${p.slug}`);

  return [...staticRoutes, ...pairRoutes].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
