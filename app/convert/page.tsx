import type { Metadata } from "next";
import { ImageStudio } from "@/components/image-studio";
import { ToolPage, type Faq } from "@/components/tool-page";

export const metadata: Metadata = {
  title: "Image Converter — HEIC, AVIF, PNG to JPG, PNG & WebP",
  description:
    "Convert images online to JPG, PNG or WebP. Supports HEIC, HEIF, AVIF, TIFF, GIF, BMP, SVG and more. Batch convert and download as a ZIP. Free and private.",
};

const faqs: Faq[] = [
  {
    q: "Which formats can I convert?",
    a: "Input: HEIC, HEIF, AVIF, JPG, PNG, WebP, GIF, BMP, TIFF and SVG. Output: JPG, PNG or WebP.",
  },
  {
    q: "How do I convert iPhone HEIC photos to JPG?",
    a: "Drop your .heic files, choose JPG as the output format, and download. You can convert many at once and grab them all in a ZIP.",
  },
  {
    q: "Does converting to JPG remove transparency?",
    a: "JPG doesn't support transparency, so transparent areas are filled with the background color you pick. Choose PNG or WebP to keep transparency.",
  },
];

export default function ConvertRoute() {
  return (
    <ToolPage
      title="Image Converter"
      description="Convert HEIC, AVIF, PNG and more to JPG, PNG or WebP. Batch convert and download as a ZIP."
      faqs={faqs}
    >
      <ImageStudio tool="convert" />
    </ToolPage>
  );
}
