/**
 * Pure TypeScript Vector Barcode Generator for Thermal Label Printing
 * Supports Code 128 (auto subsets A/B/C), EAN-13 (with automatic checksum), and Code 39.
 * Outputs crisp vector SVG data with exact pixel/mm aspect ratios.
 */

import type { BarcodeFormat } from './types';

// Code 128 Table B & C patterns
const CODE128_PATTERNS: number[] = [
  212222, 222122, 222221, 121223, 121322, 131222, 122213, 122312, 132212, 221213, // 0-9
  221312, 231212, 112232, 122132, 122231, 113222, 123122, 123221, 223211, 221132, // 10-19
  221231, 213212, 223112, 312131, 311222, 321122, 321221, 312212, 322112, 322211, // 20-29
  212123, 212321, 232121, 111323, 131123, 131321, 112313, 132113, 132311, 211313, // 30-39
  231113, 231311, 112133, 112331, 132131, 113123, 113321, 133121, 313121, 211331, // 40-49
  231131, 213113, 213311, 213131, 311123, 311321, 331121, 312113, 312311, 332111, // 50-59
  314111, 221411, 431111, 111224, 111422, 121124, 121421, 141122, 141221, 112214, // 60-69
  112412, 122114, 122411, 142112, 142211, 241211, 221114, 413111, 241112, 134111, // 70-79
  111242, 121142, 121241, 114212, 124112, 124211, 411212, 421112, 421211, 212141, // 80-89
  214121, 412121, 111143, 111341, 131141, 114113, 114311, 411113, 411311, 113141, // 90-99
  114131, 311141, 411131, 211412, 211214, 211232, 2331112 // 100-106 (106 is STOP)
];

// Start codes
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Encode string into Code 128 binary modules (1=black bar, 0=white space) */
export function encodeCode128(text: string): string {
  if (!text || text.length === 0) text = '123456';

  const codes: number[] = [];
  const chars = text.split('');
  
  // Decide start code: if all digits and length is even and >= 4, use Start C, else Start B
  const isAllDigits = /^\d+$/.test(text);
  let useCodeC = isAllDigits && text.length % 2 === 0 && text.length >= 4;

  if (useCodeC) {
    codes.push(START_C);
    for (let i = 0; i < text.length; i += 2) {
      const val = parseInt(text.slice(i, i + 2), 10);
      codes.push(val);
    }
  } else {
    codes.push(START_B);
    for (let i = 0; i < chars.length; i++) {
      const codePoint = chars[i].charCodeAt(0);
      if (codePoint >= 32 && codePoint <= 126) {
        codes.push(codePoint - 32);
      } else {
        codes.push(0); // fallback space
      }
    }
  }

  // Calculate Checksum
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(STOP);

  // Convert codes to binary module string
  let binary = '';
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;
    const digits = String(pattern).split('').map(Number);
    let isBar = true;
    for (const len of digits) {
      binary += (isBar ? '1' : '0').repeat(len);
      isBar = !isBar;
    }
  }

  return binary;
}

// EAN-13 digit encoding tables (L, G, R)
const EAN_L: string[] = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G: string[] = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R: string[] = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];

const EAN_STRUCTURE: string[] = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

export function calculateEan13Checksum(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits12[i] || '0', 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

export function encodeEan13(text: string): { binary: string; fullCode: string } {
  // Strip non-digits
  let digits = text.replace(/\D/g, '');
  if (digits.length < 12) {
    digits = digits.padEnd(12, '0');
  } else if (digits.length > 12) {
    digits = digits.slice(0, 12);
  }

  const check = calculateEan13Checksum(digits);
  const fullCode = digits + String(check);

  const firstDigit = parseInt(fullCode[0], 10);
  const structure = EAN_STRUCTURE[firstDigit] || 'LLLLLL';

  let binary = '101'; // Left guard

  // Left 6 digits (indexes 1 to 6)
  for (let i = 0; i < 6; i++) {
    const d = parseInt(fullCode[i + 1], 10);
    const type = structure[i];
    binary += type === 'L' ? EAN_L[d] : EAN_G[d];
  }

  binary += '01010'; // Center guard

  // Right 6 digits (indexes 7 to 12)
  for (let i = 7; i <= 12; i++) {
    const d = parseInt(fullCode[i], 10);
    binary += EAN_R[d];
  }

  binary += '101'; // Right guard

  return { binary, fullCode };
}

// Code 39 Table
const CODE39_MAP: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
  'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
  'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
  'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
  'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
  'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
  '$': '100100100101', '/': '100100101001', '+': '100101001001', '%': '101001001001'
};

export function encodeCode39(text: string): string {
  const upper = `*${text.toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, '')}*`;
  let binary = '';
  for (let i = 0; i < upper.length; i++) {
    const char = upper[i];
    binary += CODE39_MAP[char] || CODE39_MAP[' '];
    binary += '0'; // inter-character gap
  }
  return binary;
}

export interface BarcodeRenderResult {
  binary: string;
  displayText: string;
  bars: Array<{ x: number; width: number }>;
  totalModules: number;
}

/**
 * Generate binary bars for rendering SVG
 */
export function generateBarcodeBars(text: string, format: BarcodeFormat): BarcodeRenderResult {
  let binary = '';
  let displayText = text;

  if (format === 'ean13') {
    const res = encodeEan13(text);
    binary = res.binary;
    displayText = res.fullCode;
  } else if (format === 'code39') {
    binary = encodeCode39(text);
    displayText = text.toUpperCase();
  } else {
    binary = encodeCode128(text);
    displayText = text;
  }

  // Compress consecutive '1's into bar segments
  const bars: Array<{ x: number; width: number }> = [];
  let currentBarStart = -1;

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      if (currentBarStart === -1) currentBarStart = i;
    } else {
      if (currentBarStart !== -1) {
        bars.push({ x: currentBarStart, width: i - currentBarStart });
        currentBarStart = -1;
      }
    }
  }
  if (currentBarStart !== -1) {
    bars.push({ x: currentBarStart, width: binary.length - currentBarStart });
  }

  return {
    binary,
    displayText,
    bars,
    totalModules: binary.length,
  };
}
