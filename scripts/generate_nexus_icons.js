// Script to generate Nexus .ico and .png icons
import fs from 'fs';
import path from 'path';

function createNexusIcon(size, isDarkBg = true) {
  // Create an RGBA buffer for size x size
  const buffer = Buffer.alloc(size * size * 4, 0);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Alpha blending
    const srcA = a / 255;
    const dstA = buffer[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
      buffer[idx] = Math.round((r * srcA + buffer[idx] * dstA * (1 - srcA)) / outA);
      buffer[idx + 1] = Math.round((g * srcA + buffer[idx + 1] * dstA * (1 - srcA)) / outA);
      buffer[idx + 2] = Math.round((b * srcA + buffer[idx + 2] * dstA * (1 - srcA)) / outA);
      buffer[idx + 3] = Math.round(outA * 255);
    }
  }

  // Draw rounded dark background rectangle
  const cornerRadius = size * 0.22;
  const padding = size * 0.04;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance from inner box
      const cx = Math.max(padding + cornerRadius, Math.min(size - padding - cornerRadius, x + 0.5));
      const cy = Math.max(padding + cornerRadius, Math.min(size - padding - cornerRadius, y + 0.5));
      const dx = (x + 0.5) - cx;
      const dy = (y + 0.5) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= cornerRadius) {
        const alpha = Math.min(1, Math.max(0, cornerRadius - dist + 0.5));
        // Dark zinc-900 background #18181b
        setPixel(x, y, 24, 24, 27, Math.round(alpha * 255));
      }
    }
  }

  // Draw the "N" shape with supersampling (4x4)
  const ss = 4;
  const ssSize = size * ss;
  const scale = (size - padding * 2) / 512;
  const offsetX = padding;
  const offsetY = padding;

  // Polygons for the N shape:
  // Left vertical bar: [150, 106] to [200, 406]
  // Right vertical bar: [336, 106] to [386, 406]
  // Diagonal: (196, 106) -> (386, 396) and (326, 406) -> (140, 116)
  
  // Point in polygon test
  function isInsideN(px, py) {
    // Normalise to 512x512 space
    const nx = (px - offsetX) / scale;
    const ny = (py - offsetY) / scale;

    // Left bar (140 to 210, 100 to 410)
    if (nx >= 145 && nx <= 205 && ny >= 105 && ny <= 405) return true;
    // Right bar (330 to 390, 100 to 410)
    if (nx >= 330 && nx <= 390 && ny >= 105 && ny <= 405) return true;

    // Diagonal stroke connecting top-left to bottom-right
    // Line 1: from (196, 102) to (386, 406)
    // Line 2: from (145, 112) to (335, 416)
    const t = (ny - 105) / (405 - 105);
    if (t >= 0 && t <= 1) {
      const minX = 145 + t * (330 - 145);
      const maxX = 205 + t * (390 - 205);
      if (nx >= minX && nx <= maxX) return true;
    }

    return false;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (isInsideN(px, py)) hits++;
        }
      }
      if (hits > 0) {
        const coverage = hits / (ss * ss);
        // Crisp pure white / slate-50 logo #f8fafc
        setPixel(x, y, 248, 250, 252, Math.round(coverage * 255));
      }
    }
  }

  return buffer;
}

// Convert RGBA buffer to standard uncompressed Windows ICO binary format (BMP DIB format with alpha)
function buildIcoFromImages(images) {
  // images = [{ width, height, rgbaBuffer }]
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  let offset = headerSize + dirEntrySize * numImages;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(numImages, 4);

  const entries = [];
  const bitBuffers = [];

  for (const img of images) {
    const w = img.width;
    const h = img.height;
    const biSizeImage = w * h * 4;
    const biHeaderSize = 40;
    // In ICO BMP DIB, biHeight is 2 * h (image height + AND mask height)
    const dibSize = biHeaderSize + biSizeImage + Math.ceil(w / 32) * 4 * h;

    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(w >= 256 ? 0 : w, 0);
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(dibSize, 8); // size of bitmap data
    entry.writeUInt32LE(offset, 12); // file offset

    entries.push(entry);
    offset += dibSize;

    const dib = Buffer.alloc(dibSize, 0);
    // BITMAPINFOHEADER
    dib.writeUInt32LE(biHeaderSize, 0); // biSize
    dib.writeInt32LE(w, 4); // biWidth
    dib.writeInt32LE(h * 2, 8); // biHeight (double for ICO)
    dib.writeUInt16LE(1, 12); // biPlanes
    dib.writeUInt16LE(32, 14); // biBitCount
    dib.writeUInt32LE(0, 16); // biCompression (BI_RGB)
    dib.writeUInt32LE(biSizeImage, 20); // biSizeImage
    dib.writeInt32LE(0, 24); // biXPelsPerMeter
    dib.writeInt32LE(0, 28); // biYPelsPerMeter
    dib.writeUInt32LE(0, 32); // biClrUsed
    dib.writeUInt32LE(0, 36); // biClrImportant

    // Write RGBA pixels in bottom-up order (BGRA)
    let dibOffset = biHeaderSize;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 4;
        const r = img.rgbaBuffer[srcIdx];
        const g = img.rgbaBuffer[srcIdx + 1];
        const b = img.rgbaBuffer[srcIdx + 2];
        const a = img.rgbaBuffer[srcIdx + 3];

        dib[dibOffset] = b;
        dib[dibOffset + 1] = g;
        dib[dibOffset + 2] = r;
        dib[dibOffset + 3] = a;
        dibOffset += 4;
      }
    }

    // AND mask (all zeros because alpha is in 32-bit channel)
    // already 0-filled

    bitBuffers.push(dib);
  }

  return Buffer.concat([header, ...entries, ...bitBuffers]);
}

const sizes = [16, 32, 48, 64];
const images = sizes.map(s => ({
  width: s,
  height: s,
  rgbaBuffer: createNexusIcon(s)
}));

const icoBuffer = buildIcoFromImages(images);

const backendIconsDir = path.resolve('C:/api/Backend/icons');
fs.mkdirSync(backendIconsDir, { recursive: true });

fs.writeFileSync(path.join(backendIconsDir, 'icon.ico'), icoBuffer);
fs.writeFileSync(path.join(backendIconsDir, 'nexus_icon.ico'), icoBuffer);
fs.writeFileSync('C:/api/Backend/src/nexus_icon.ico', icoBuffer);

console.log('Nexus icons generated successfully at', backendIconsDir);
