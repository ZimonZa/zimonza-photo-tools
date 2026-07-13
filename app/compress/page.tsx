import type { Metadata } from "next";
import { ImageStudio } from "@/components/image-studio";
import { ToolPage, type Faq } from "@/components/tool-page";

export const metadata: Metadata = {
  title: "Image Compressor — Reduce Image File Size Online",
  description:
    "Compress JPG, PNG and WebP images online. Shrink file size with a quality slider or compress to an exact target size in KB. Private, fast and free.",
};

const faqs: Faq[] = [
  {
    q: "How do I compress an image to a specific size?",
    a: "Choose JPG or WebP, turn on 'Target a file size', and enter the size in KB. The compressor finds the highest quality that fits under your target.",
  },
  {
    q: "What's the difference between quality and target size?",
    a: "Quality lets you pick a compression level directly. Target size works backwards from a file-size goal and chooses the quality for you.",
  },
  {
    q: "Can I compress many images at once?",
    a: "Yes. Add multiple images, set your compression, and download them all together as a ZIP.",
  },
];

export default function CompressRoute() {
  return (
    <ToolPage
      title="Image Compressor"
      description="Reduce file size with a quality slider, or compress to an exact target size in KB."
      faqs={faqs}
    >
      <ImageStudio
        tool="compress"
        initialSettings={{
          targetSizeEnabled: true,
          targetSizeValue: 150,
          targetSizeUnit: "KB",
        }}
      />
    </ToolPage>
  );
}
