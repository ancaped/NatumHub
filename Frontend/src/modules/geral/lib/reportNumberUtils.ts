import { Report } from './types';

export interface MonthRangeConfig {
  year: number;
  month: number; // 1-12
  monthName: string;
  startNumber: number;
  reservedCount: number;
  endNumber: number;
  isInitialBlock?: boolean;
}

export const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/**
 * Retorna a faixa base de numeração reservada para um determinado mês/ano.
 * - Meses 01 a 06 (Janeiro a Junho): compartilham a faixa de 7154 até 7224 (71 lotes reservados, pois até 7153 são lotes manuais/anteriores).
 * - A partir do Mês 07 (Julho): cada mês possui 300 lotes reservados (7225-7524, 7525-7824, etc.).
 */
export function getMonthRange(year: number, month: number): MonthRangeConfig {
  const monthName = MONTH_NAMES_PT[month - 1] || `Mês ${month}`;

  let startNumber: number;
  let reservedCount: number;
  let isInitialBlock = false;

  if (month <= 6) {
    // Junho e meses anteriores compartilham a faixa 7154 até 7224
    startNumber = 7154;
    reservedCount = 71;
    isInitialBlock = true;
  } else {
    // A partir de Julho (mês 7): base 7225 com 300 números por mês
    startNumber = 7225 + (month - 7) * 300;
    reservedCount = 300;
  }

  const endNumber = startNumber + reservedCount - 1;

  return {
    year,
    month,
    monthName,
    startNumber,
    reservedCount,
    endNumber,
    isInitialBlock,
  };
}

/**
 * Extrai o mês e ano a partir de uma data string (DD/MM/AAAA ou YYYY-MM-DD).
 */
export function parseMonthYear(dateStr: string): { year: number; month: number } {
  const today = new Date();
  if (!dateStr) return { year: today.getFullYear(), month: today.getMonth() + 1 };

  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD/MM/YYYY
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (m >= 1 && m <= 12 && y >= 2000) return { year: y, month: m };
    } else if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (m >= 1 && m <= 12 && y >= 2000) return { year: y, month: m };
    }
  }

  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/**
 * Calcula o próximo número de laudo para uma data específica com base nos laudos já existentes.
 * Garante que a numeração comece na faixa do respectivo mês e pule qualquer número já ocupado,
 * evitando colisões mesmo se ultrapassar a faixa inicial reservada.
 */
export function getNextReportNumberForDate(
  dateStr: string,
  existingReports: Report[],
  offsetInCurrentBatch: number = 0,
): { rawNum: number; reportId: string; year: number; month: number } {
  const { year, month } = parseMonthYear(dateStr);
  const range = getMonthRange(year, month);

  // Conjunto de números já utilizados no ano
  const usedNumbers = new Set<number>();
  for (const r of existingReports) {
    if (r.reportRawNum) {
      usedNumbers.add(r.reportRawNum);
    }
  }

  // Encontra o próximo número livre a partir de range.startNumber
  let candidate = range.startNumber;
  let freeFound = 0;

  while (true) {
    if (!usedNumbers.has(candidate)) {
      if (freeFound === offsetInCurrentBatch) {
        break;
      }
      freeFound++;
    }
    candidate++;
  }

  const nextRaw = candidate;
  const yearSuffix = (year % 100).toString().padStart(2, '0');
  const reportId = `${nextRaw}/${yearSuffix}`;

  return {
    rawNum: nextRaw,
    reportId,
    year,
    month,
  };
}

/**
 * Retorna o resumo das faixas e ocupação de todos os meses para visualização em Configurações.
 */
export function getAllMonthRangesSummary(reports: Report[], currentYear: number = 2026) {
  const summaries = [];

  for (let m = 1; m <= 12; m++) {
    const range = getMonthRange(currentYear, m);

    // Contagem de laudos do mês específico
    const monthReports = reports.filter((r) => {
      const rMy = parseMonthYear(r.collectionDate);
      return rMy.year === currentYear && rMy.month === m;
    });

    // Para saber o próximo número do bloco
    const blockReports = reports.filter((r) => {
      const rMy = parseMonthYear(r.collectionDate);
      if (m <= 6) {
        return rMy.year === currentYear && rMy.month <= 6;
      }
      return rMy.year === currentYear && rMy.month === m;
    });

    let maxNum = 0;
    for (const r of blockReports) {
      if (r.reportRawNum && r.reportRawNum >= range.startNumber && r.reportRawNum <= range.endNumber) {
        if (r.reportRawNum > maxNum) maxNum = r.reportRawNum;
      }
    }

    const nextAvailable = maxNum > 0 ? maxNum + 1 : range.startNumber;
    const remaining = Math.max(0, range.endNumber - nextAvailable + 1);

    summaries.push({
      ...range,
      count: monthReports.length,
      nextAvailable,
      nextReportId: `${nextAvailable}/${currentYear % 100}`,
      remaining,
    });
  }

  return summaries;
}
