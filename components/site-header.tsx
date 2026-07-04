"use client";

import { Aperture } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOOLS } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="group flex items-center gap-2.5 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent2 text-accent-foreground shadow-glow transition-shadow group-hover:shadow-glow-lg">
            <Aperture className="h-[18px] w-[18px]" />
          </span>
          <span className="hidden font-display tracking-tight sm:inline">
            ZimonZa <span className="text-muted-foreground">Photo Tools</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {TOOLS.map((tool) => {
            const active = pathname === tool.href || pathname === `${tool.href}/`;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={cn(
                  "relative rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
                  active
                    ? "bg-accent/10 font-medium text-accent ring-1 ring-inset ring-accent/30"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tool.short}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile nav — scrollable pill row */}
      <nav
        aria-label="Tools"
        className="flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TOOLS.map((tool) => {
          const active = pathname === tool.href || pathname === `${tool.href}/`;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(
                "whitespace-nowrap rounded-full border px-3.5 py-1 text-sm transition-colors",
                active
                  ? "border-accent/50 bg-accent/10 font-medium text-accent"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {tool.short}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
