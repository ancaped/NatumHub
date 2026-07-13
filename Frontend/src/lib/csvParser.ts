/**
 * Parses a number string that can be in Brazilian format (1.234,56) 
 * or International format (1234.56).
 */
export function parseBrazilianNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (!value || String(value).trim() === '') return 0;
  
  let str = String(value).trim();

  // If there's a comma, it's definitely Brazilian format (1.234,56 or 1234,56)
  if (str.includes(',')) {
    // Remove dots (thousand separators) and replace comma with dot
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  
  // If there's no comma but there is a dot, check if it's a thousand separator or decimal
  if (str.includes('.')) {
    const parts = str.split('.');
    // If more than one dot, they are thousand separators
    if (parts.length > 2) {
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
    // If one dot and it's near the end (2 or 3 digits), it's ambiguous but usually decimal in Excel
    // However, if the file is CSV and uses dot for thousands, it would be 1.234
    // We assume that if there are no commas, a single dot is a decimal point (standard programming format)
    return parseFloat(str) || 0;
  }

  return parseFloat(str) || 0;
}

export function parseCSVLine(line: string, separator: string = ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { 
      inQuotes = !inQuotes; 
    } else if (char === separator && !inQuotes) { 
      result.push(current.trim()); 
      current = ''; 
    } else { 
      current += char; 
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSVContent(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  
  // Detect separator from first line
  const firstLine = lines[0];
  const separator = firstLine.includes(';') ? ';' : (firstLine.includes(',') ? ',' : ';');
  
  return lines.map(line => parseCSVLine(line, separator));
}
