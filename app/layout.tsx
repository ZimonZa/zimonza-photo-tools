import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL } from "@/lib/site";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ZimonZa Photo Tools — Resize, Crop, Convert & Compress Images",
    template: "%s — ZimonZa Photo Tools",
  },
  description:
    "Free online image resizer, cropper, converter and compressor. Resize by pixels, percent or target file size. Convert HEIC, AVIF, PNG and more to JPG, PNG or WebP. 100% private, processed in your browser.",
  keywords: [
    "image resizer",
    "photo resizer",
    "image converter",
    "heic to jpg",
    "compress image",
    "crop image",
    "resize image online",
  ],
  openGraph: {
    type: "website",
    title: "ZimonZa Photo Tools",
    description:
      "Resize, crop, convert and compress images in your browser. Private and free.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
