import { describe, expect, test } from "vitest";
import { topLevelBoxes } from "@/lib/video/test-utils/mp4";

function box(type: string, payloadBytes: number): Uint8Array {
  const size = 8 + payloadBytes;
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode(type), 4);
  return out;
}

function concat(...parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out.buffer;
}

describe("topLevelBoxes", () => {
  test("lists top-level box types in file order", () => {
    expect(topLevelBoxes(concat(box("ftyp", 8), box("moov", 0), box("mdat", 0)))).toEqual(["ftyp", "moov", "mdat"]);
  });

  test("follows a 64-bit largesize box", () => {
    // size field 1 => the real size is the 64-bit value after the type.
    const large = new Uint8Array(24);
    const view = new DataView(large.buffer);
    view.setUint32(0, 1);
    large.set(new TextEncoder().encode("mdat"), 4);
    view.setBigUint64(8, BigInt(24));
    expect(topLevelBoxes(concat(box("ftyp", 0), large, box("moov", 0)))).toEqual(["ftyp", "mdat", "moov"]);
  });
});
