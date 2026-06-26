import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { TOOLS } from "@/lib/formats";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-sm">
            <p className="font-semibold">ZimonZa Photo Tools</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Resize, crop, convert and compress images right in your browser.
              Your files never leave your device.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              100% private &amp; processed on-device
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {tool.title}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} ZimonZa. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
