/**
 * Canonical site URL used for metadata, sitemap, robots and OG/canonical links.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_SITE_URL — set this when using a custom domain.
 *  2. VERCEL_PROJECT_PRODUCTION_URL — injected automatically by Vercel; resolves
 *     to the project's production *.vercel.app domain (no manual config needed).
 *  3. localhost fallback for local development.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
