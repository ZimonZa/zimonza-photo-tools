import Link from "next/link";
import {
  ArrowRight,
  Crop,
  ImageIcon,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { TOOLS } from "@/lib/formats";

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/resize": Maximize2,
  "/crop": Crop,
  "/convert": RefreshCw,
  "/compress": ImageIcon,
};

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "100% private",
    body: "Images are processed on your device and never uploaded to a server.",
  },
  {
    icon: Zap,
    title: "Instant & free",
    body: "No sign-up, no watermarks, no limits. Works straight from the browser.",
  },
  {
    icon: Sparkles,
    title: "High quality",
    body: "Sharp, high-quality resizing and precise format conversion.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="py-16 text-center sm:py-24">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          Private, on-device image processing
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Resize, crop, convert &amp; compress your photos
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          A fast, minimalist toolkit for everyday image edits. Drop a file, tweak
          it, and download — all without leaving your browser.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/resize"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Start resizing
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/convert"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Convert an image
          </Link>
        </div>
      </section>

      {/* Tools grid */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.href] ?? ImageIcon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/50 hover:shadow-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-semibold">{tool.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tool.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Open
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </section>

      {/* Features */}
      <section className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="text-center sm:text-left">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
              <feature.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-3 font-semibold">{feature.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
