import type { Metadata } from "next";
import { ImageStudio } from "@/components/image-studio";
import { ToolPage, type Faq } from "@/components/tool-page";

export const metadata: Metadata = {
  title: "Image Resizer — Resize by Pixels, Percent or File Size",
  description:
    "Resize images online by exact pixels, percentage, common presets, or to a target file size in KB. High-quality, private, and free. No upload required.",
};

const faqs: Faq[] = [
  {
    q: "How do I resize an image to an exact size?",
    a: "Drop your image, choose Pixels, and enter the width and/or height. Keep the lock enabled to preserve the aspect ratio, or unlock it to set both dimensions independently.",
  },
  {
    q: "Can I resize an image to a specific file size, like 100 KB?",
    a: "Yes. Turn on 'Target a file size' in the output settings and enter your target in KB. The tool automatically finds the best quality that fits within that size for JPG and WebP.",
  },
  {
    q: "Will resizing reduce the quality?",
    a: "Downscaling uses a high-quality Lanczos filter for sharp results. Enabling 'Don't enlarge' prevents blurry upscaling of small images.",
  },
  {
    q: "Are my images uploaded anywhere?",
    a: "No. All processing happens locally in your browser — your photos never leave your device.",
  },
];

export default function ResizeRoute() {
  return (
    <ToolPage
      title="Image Resizer"
      description="Resize by exact pixels, percentage, a common preset, or a target file size — all in your browser."
      faqs={faqs}
    >
      <ImageStudio tool="resize" initialSettings={{ dimensionMode: "px" }} />
    </ToolPage>
  );
}
