import Link from "next/link";
import { Aperture, ShieldCheck } from "lucide-react";
import { TOOLS } from "@/lib/formats";

export function SiteFooter() {
  return (
    <footer className="relative mt-24">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-sm">
            <p className="flex items-center gap-2 font-display font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-accent-foreground">
                <Aperture className="h-4 w-4" />
              </span>
              ZimonZa Photo Tools
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Resize, crop, convert and compress images right in your browser.
              Your files never leave your device.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              100% private &amp; processed on-device
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-2.5 text-sm">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="text-muted-foreground transition-colors hover:text-accent"
              >
                {tool.title}
              </Link>
            ))}
            <Link
              href="/about"
              className="text-muted-foreground transition-colors hover:text-accent"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground transition-colors hover:text-accent"
            >
              Privacy
            </Link>
          </nav>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} ZimonZa. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
