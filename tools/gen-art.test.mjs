import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { crc32, encodePNG, PNG_SIG } from "./gen-art.mjs";

// a hand-checked 4x4: index grid, palette [transparent, black, white]
const W = 4, H = 4;
const idx = Uint8Array.from([
  0, 1, 1, 0,
  1, 2, 2, 1,
  1, 2, 2, 1,
  0, 1, 1, 0,
]);
const palette = ["#000000", "#111111", "#eeeeee"];

test("crc32 matches a known value", () => {
  // CRC-32 of ASCII "IEND" is 0xAE426082
  assert.equal(crc32(Buffer.from("IEND", "latin1")) >>> 0, 0xAE426082);
});

test("encodePNG emits a valid colour-type-3 PNG", () => {
  const png = encodePNG({ width: W, height: H, palette, indices: idx });
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 8)], [...PNG_SIG]);

  let off = 8, seen = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("latin1", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    const crcGot = png.readUInt32BE(off + 8 + len) >>> 0;
    const crcCalc = crc32(png.subarray(off + 4, off + 8 + len)) >>> 0;
    assert.equal(crcGot, crcCalc, "CRC of chunk " + type);
    seen.push(type);
    if (type === "IHDR") {
      assert.equal(data.readUInt32BE(0), W);
      assert.equal(data.readUInt32BE(4), H);
      assert.equal(data[8], 8);   // bit depth
      assert.equal(data[9], 3);   // colour type = indexed
    }
    if (type === "IDAT") {
      const raw = zlib.inflateSync(data);
      assert.equal(raw.length, H * (1 + W));
      for (let y = 0; y < H; y++) {
        assert.equal(raw[y * (1 + W)], 0, "filter byte");
        for (let x = 0; x < W; x++) {
          assert.equal(raw[y * (1 + W) + 1 + x], idx[y * W + x]);
        }
      }
    }
    off += 12 + len;
  }
  assert.deepEqual(seen, ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
});
