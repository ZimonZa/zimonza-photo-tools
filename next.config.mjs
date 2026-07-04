/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static site (all processing is client-side) — served by GitHub Pages.
  output: "export",
  trailingSlash: true,
  // GitHub Pages serves project sites under /<repo>; local dev stays at root.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

export default nextConfig;
