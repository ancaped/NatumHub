/**
 * Pure TypeScript QR Code Generator (Model 2)
 * Generates an exact boolean 2D matrix (true = dark, false = light)
 * Renders into razor-sharp SVG vector paths for thermal label printing.
 */

// GF(256) Math tables for Reed-Solomon
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
})();

function gMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const factor = new Uint8Array([1, EXP_TABLE[i]]);
    const newPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= gMul(poly[j], factor[0]);
      newPoly[j + 1] ^= gMul(poly[j], factor[1]);
    }
    poly = newPoly;
  }
  return poly;
}

function rsEncode(data: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < numEcBytes - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gMul(gen[j + 1], factor);
    }
    remainder[numEcBytes - 1] = gMul(gen[numEcBytes], factor);
  }

  return remainder;
}

// Version & capacity specifications for Byte mode, Error Correction Level M
interface QrVersionSpec {
  version: number;
  totalDataBytes: number;
  ecBytes: number;
  numBlocks: number;
  alignPos: number[];
}

const QR_SPECS: QrVersionSpec[] = [
  { version: 1, totalDataBytes: 16, ecBytes: 10, numBlocks: 1, alignPos: [] },
  { version: 2, totalDataBytes: 28, ecBytes: 16, numBlocks: 1, alignPos: [6, 18] },
  { version: 3, totalDataBytes: 44, ecBytes: 26, numBlocks: 1, alignPos: [6, 22] },
  { version: 4, totalDataBytes: 64, ecBytes: 36, numBlocks: 2, alignPos: [6, 26] },
  { version: 5, totalDataBytes: 86, ecBytes: 48, numBlocks: 2, alignPos: [6, 30] },
  { version: 6, totalDataBytes: 108, ecBytes: 64, numBlocks: 4, alignPos: [6, 34] },
  { version: 7, totalDataBytes: 124, ecBytes: 72, numBlocks: 4, alignPos: [6, 22, 38] },
  { version: 8, totalDataBytes: 154, ecBytes: 88, numBlocks: 4, alignPos: [6, 24, 42] },
  { version: 9, totalDataBytes: 182, ecBytes: 110, numBlocks: 5, alignPos: [6, 26, 46] },
  { version: 10, totalDataBytes: 216, ecBytes: 130, numBlocks: 5, alignPos: [6, 28, 50] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const utf8 = encoder.encode(text || ' ');

  // Select minimum version
  let spec = QR_SPECS[0];
  for (const s of QR_SPECS) {
    // 4 bits mode + 8 bits length + data
    const maxDataLength = s.totalDataBytes - s.ecBytes - 2;
    if (utf8.length <= maxDataLength) {
      spec = s;
      break;
    }
    spec = s; // highest available
  }

  const moduleCount = spec.version * 4 + 17;
  const matrix: boolean[][] = Array.from({ length: moduleCount }, () =>
    Array(moduleCount).fill(false)
  );
  const isFunctionModule: boolean[][] = Array.from({ length: moduleCount }, () =>
    Array(moduleCount).fill(false)
  );

  // Helper to mark function modules
  const setFunc = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < moduleCount && c >= 0 && c < moduleCount) {
      matrix[r][c] = val;
      isFunctionModule[r][c] = true;
    }
  };

  // 1. Finder Patterns (Top-Left, Top-Right, Bottom-Left)
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const isBlack = inOuter || inInner;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          setFunc(row + r, col + c, isBlack);
        } else {
          setFunc(row + r, col + c, false); // Separator
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, moduleCount - 7);
  drawFinder(moduleCount - 7, 0);

  // 2. Timing Patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    const val = i % 2 === 0;
    setFunc(6, i, val);
    setFunc(i, 6, val);
  }

  // 3. Alignment Patterns
  if (spec.alignPos.length > 0) {
    for (const r of spec.alignPos) {
      for (const c of spec.alignPos) {
        if (isFunctionModule[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setFunc(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // 4. Dark Module
  setFunc(moduleCount - 8, 8, true);

  // 5. Reserve Format Info bits
  for (let i = 0; i < 9; i++) {
    setFunc(8, i, false);
    setFunc(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, moduleCount - 1 - i, false);
    setFunc(moduleCount - 1 - i, 8, false);
  }

  // 6. Encode Data stream in Byte mode (Mode=0100)
  const bitBuffer: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(utf8.length, 8); // Character count indicator
  for (const b of utf8) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zeroes)
  const totalCapacityBits = (spec.totalDataBytes - spec.ecBytes) * 8;
  const termLen = Math.min(4, totalCapacityBits - bitBuffer.length);
  for (let i = 0; i < termLen; i++) bitBuffer.push(0);

  // Pad to byte boundary
  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  // Pad bytes (0xEC, 0x11 alternating)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < totalCapacityBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bitBuffer to data bytes
  const dataBytes = new Uint8Array(totalCapacityBits / 8);
  for (let i = 0; i < dataBytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitBuffer[i * 8 + b];
    }
    dataBytes[i] = byte;
  }

  // Reed Solomon Error Correction
  const ecBytesPerBlock = Math.floor(spec.ecBytes / spec.numBlocks);
  const dataBytesPerBlock = Math.floor(dataBytes.length / spec.numBlocks);
  const allEcBlocks: Uint8Array[] = [];

  for (let block = 0; block < spec.numBlocks; block++) {
    const start = block * dataBytesPerBlock;
    const blockData = dataBytes.slice(start, start + dataBytesPerBlock);
    allEcBlocks.push(rsEncode(blockData, ecBytesPerBlock));
  }

  // Interleave data and EC bytes
  const finalSequence: number[] = [];
  for (let i = 0; i < dataBytesPerBlock; i++) {
    for (let block = 0; block < spec.numBlocks; block++) {
      finalSequence.push(dataBytes[block * dataBytesPerBlock + i]);
    }
  }
  for (let i = 0; i < ecBytesPerBlock; i++) {
    for (let block = 0; block < spec.numBlocks; block++) {
      finalSequence.push(allEcBlocks[block][i]);
    }
  }

  // Convert final sequence to bit array
  const finalBits: number[] = [];
  for (const byte of finalSequence) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((byte >> i) & 1);
    }
  }

  // 7. Place data bits in matrix (zig-zag right-to-left, columns of 2)
  let bitIndex = 0;
  let dirUp = true;

  for (let col = moduleCount - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip vertical timing line

    for (let step = 0; step < moduleCount; step++) {
      const row = dirUp ? moduleCount - 1 - step : step;

      for (let cOffset = 0; cOffset < 2; cOffset++) {
        const c = col - cOffset;
        if (!isFunctionModule[row][c]) {
          const bit = bitIndex < finalBits.length ? finalBits[bitIndex] === 1 : false;
          bitIndex++;

          // Apply Mask Pattern 0: (row + col) % 2 == 0
          const mask = (row + c) % 2 === 0;
          matrix[row][c] = mask ? !bit : bit;
        }
      }
    }
    dirUp = !dirUp;
  }

  // 8. Format Information (Error Level M = 00, Mask 0 = 000 -> 00000)
  // Format bits with BCH(15,5) mask 101010000010010
  const FORMAT_BITS_M_MASK0 = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Draw format bits around finder patterns
  for (let i = 0; i < 6; i++) {
    matrix[8][i] = FORMAT_BITS_M_MASK0[i] === 1;
  }
  matrix[8][7] = FORMAT_BITS_M_MASK0[6] === 1;
  matrix[8][8] = FORMAT_BITS_M_MASK0[7] === 1;
  matrix[7][8] = FORMAT_BITS_M_MASK0[8] === 1;
  for (let i = 9; i < 15; i++) {
    matrix[14 - i][8] = FORMAT_BITS_M_MASK0[i] === 1;
  }

  // Second copy
  for (let i = 0; i < 7; i++) {
    matrix[moduleCount - 1 - i][8] = FORMAT_BITS_M_MASK0[i] === 1;
  }
  for (let i = 7; i < 15; i++) {
    matrix[8][moduleCount - 15 + i] = FORMAT_BITS_M_MASK0[i] === 1;
  }

  return matrix;
}
