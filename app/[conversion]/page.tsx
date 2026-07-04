import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FORMAT_PAIRS, OUTPUT_FORMATS } from "@/lib/formats";
import { ImageStudio } from "@/components/image-studio";
import { ToolPage, type Faq } from "@/components/tool-page";

// Static export: only the listed format pairs exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return FORMAT_PAIRS.map((pair) => ({ conversion: pair.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { conversion: string };
}): Metadata {
  const pair = FORMAT_PAIRS.find((p) => p.slug === params.conversion);
  if (!pair) return {};
  const to = OUTPUT_FORMATS[pair.to].label;
  return {
    title: `Convert ${pair.fromLabel} to ${to} — Free Online Converter`,
    description: `Convert ${pair.fromLabel} images to ${to} online for free. Fast, high-quality, batch-ready and 100% private — files are processed in your browser.`,
  };
}

export default function ConversionRoute({
  params,
}: {
  params: { conversion: string };
}) {
  const pair = FORMAT_PAIRS.find((p) => p.slug === params.conversion);
  if (!pair) notFound();

  const to = OUTPUT_FORMATS[pair.to].label;
  const faqs: Faq[] = [
    {
      q: `How do I convert ${pair.fromLabel} to ${to}?`,
      a: `Drop your ${pair.fromLabel} file above — the output is already set to ${to}. Adjust quality if you like, then click Download. You can convert several files at once and download them as a ZIP.`,
    },
    {
      q: "Is it free and private?",
      a: "Yes. The converter is completely free and runs entirely in your browser, so your images are never uploaded to a server.",
    },
  ];

  return (
    <ToolPage
      title={`Convert ${pair.fromLabel} to ${to}`}
      description={`Turn your ${pair.fromLabel} images into ${to} in seconds. Drag, drop, and download — privately, in your browser.`}
      faqs={faqs}
    >
      <ImageStudio tool="convert" initialSettings={{ format: pair.to }} />
    </ToolPage>
  );
}
