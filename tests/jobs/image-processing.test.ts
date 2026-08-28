import { describe, expect, it } from "vitest";
import { detectImageMime } from "@/jobs/image-processing";

describe("detectImageMime", () => {
  it("recognizes a JPEG signature", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMime(buf)).toBe("image/jpeg");
  });

  it("recognizes a PNG signature", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMime(buf)).toBe("image/png");
  });

  it("recognizes a WebP (RIFF/WEBP) signature", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(detectImageMime(buf)).toBe("image/webp");
  });

  it("rejects a file whose bytes don't match any known image signature — a client-supplied Content-Type is never trusted", () => {
    const disguisedScript = Buffer.from("<?php system($_GET['c']); ?>", "ascii");
    expect(detectImageMime(disguisedScript)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });
});
