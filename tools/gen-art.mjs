// Potato Pet art generator. node:zlib only, no deps. Deterministic output.
// Run:  node gen-art.mjs           regenerate every PNG under potato-pet/assets/sprites/
//       node gen-art.mjs --preview print ASCII of every sprite, write nothing
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function hexToRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function encodePNG({ width, height, palette, indices }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type: indexed
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((h, i) => {
    const [r, g, b] = hexToRGB(h);
    plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b;
  });

  const trns = Buffer.from([0]); // palette index 0 fully transparent

  const raw = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width)] = 0; // filter: none
    for (let x = 0; x < width; x++) raw[y * (1 + width) + 1 + x] = indices[y * width + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from(PNG_SIG),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("tRNS", trns),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- generator entry (filled in by later tasks) ---
function main() {
  console.log("gen-art: nothing to generate yet");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
