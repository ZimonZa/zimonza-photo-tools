import Link from "next/link";
import {
  ArrowRight,
  Crop,
  Download,
  ImageIcon,
  Maximize2,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
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

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Drop your images",
    body: "Drag & drop, click, or paste. JPG, PNG, WebP, HEIC, AVIF and more.",
  },
  {
    icon: SlidersHorizontal,
    title: "Tweak the settings",
    body: "Resize, crop, pick a format, or set an exact target file size.",
  },
  {
    icon: Download,
    title: "Download instantly",
    body: "Grab a single file or everything at once as a ZIP.",
  },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient backdrop */}
      <div className="bg-glow pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[560px]" />

      <div className="relative mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="py-20 text-center sm:py-28">
          <p className="animate-fade-up inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1 text-xs font-medium text-accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            Private, on-device image processing
          </p>
          <h1 className="animate-fade-up mx-auto mt-6 max-w-3xl text-balance font-display text-4xl font-bold tracking-tight [animation-delay:100ms] sm:text-6xl">
            Your photos, <span className="gradient-text">perfected</span> in
            seconds
          </h1>
          <p className="animate-fade-up mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground [animation-delay:200ms] sm:text-lg">
            Resize, crop, convert and compress images with a fast, minimalist
            toolkit. Drop a file, tweak it, download — without leaving your
            browser.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:300ms]">
            <Link
              href="/resize"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent2 px-6 py-3 text-sm font-semibold text-accent-foreground shadow-glow transition-all duration-200 hover:shadow-glow-lg hover:brightness-110"
            >
              Start resizing
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/convert"
              className="glass inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 hover:border-border-strong hover:bg-muted/60"
            >
              Convert an image
            </Link>
          </div>
          <p className="animate-fade-up mt-6 text-xs text-muted-foreground [animation-delay:400ms]">
            Free forever · No sign-up · Works offline once loaded
          </p>
        </section>

        {/* Tools grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((tool, i) => {
            const Icon = TOOL_ICONS[tool.href] ?? ImageIcon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="glass group animate-fade-up rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-glow"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent2/20 text-accent ring-1 ring-inset ring-accent/20 transition-all duration-300 group-hover:from-accent group-hover:to-accent2 group-hover:text-accent-foreground group-hover:shadow-glow">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 font-display font-semibold tracking-tight">
                  {tool.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </section>

        {/* How it works */}
        <section className="mt-24">
          <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Three steps. <span className="gradient-text">That&apos;s it.</span>
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="glass relative rounded-2xl p-6"
              >
                <span className="absolute right-5 top-4 font-display text-4xl font-bold text-muted-foreground/15">
                  {i + 1}
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-accent">
                  <step.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mt-24 grid grid-cols-1 gap-8 text-center sm:grid-cols-3 sm:text-left">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-accent2/15 text-accent ring-1 ring-inset ring-accent/20">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 font-display font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </section>

        {/* Bottom CTA */}
        <section className="glass relative mt-24 overflow-hidden rounded-3xl p-10 text-center sm:p-14">
          <div className="bg-glow pointer-events-none absolute inset-0" />
          <div className="relative">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to <span className="gradient-text">perfect</span> your photos?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              No accounts, no uploads, no waiting. Open a tool and drop an image.
            </p>
            <Link
              href="/resize"
              className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent2 px-6 py-3 text-sm font-semibold text-accent-foreground shadow-glow transition-all duration-200 hover:shadow-glow-lg hover:brightness-110"
            >
              Get started
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
