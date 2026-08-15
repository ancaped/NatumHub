/**
 * Utilitário de Feriados Nacionais do Brasil e Validação de Dias Úteis
 */

export interface HolidayInfo {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national_fixed' | 'national_movable' | 'facultative';
}

/**
 * Calcula o Domingo de Páscoa para um determinado ano utilizando o algoritmo de Butcher / Meeus.
 */
export function getEasterSunday(year: number): { day: number; month: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { day, month };
}

/**
 * Retorna todos os feriados do Brasil para um determinado ano.
 */
export function getBrazilHolidaysForYear(year: number): HolidayInfo[] {
  const pad = (n: number) => n.toString().padStart(2, '0');

  const fixedHolidays: { month: number; day: number; name: string }[] = [
    { month: 1, day: 1, name: 'Confraternização Universal (Ano Novo)' },
    { month: 4, day: 21, name: 'Tiradentes' },
    { month: 5, day: 1, name: 'Dia do Trabalhador' },
    { month: 9, day: 7, name: 'Independência do Brasil' },
    { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
    { month: 11, day: 2, name: 'Finados' },
    { month: 11, day: 15, name: 'Proclamação da República' },
    { month: 11, day: 20, name: 'Dia da Consciência Negra' },
    { month: 12, day: 25, name: 'Natal' },
  ];

  const list: HolidayInfo[] = fixedHolidays.map((h) => ({
    date: `${year}-${pad(h.month)}-${pad(h.day)}`,
    name: h.name,
    type: 'national_fixed',
  }));

  // Feriados Móveis baseados na Páscoa
  const easter = getEasterSunday(year);
  const easterDate = new Date(year, easter.month - 1, easter.day);

  const addDays = (base: Date, days: number): string => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  list.push({
    date: addDays(easterDate, -48),
    name: 'Carnaval (Segunda-feira)',
    type: 'national_movable',
  });
  list.push({
    date: addDays(easterDate, -47),
    name: 'Carnaval (Terça-feira)',
    type: 'national_movable',
  });
  list.push({
    date: addDays(easterDate, -46),
    name: 'Quarta-feira de Cinzas',
    type: 'facultative',
  });
  list.push({
    date: addDays(easterDate, -2),
    name: 'Sexta-feira Santa (Paixão de Cristo)',
    type: 'national_movable',
  });
  list.push({
    date: `${year}-${pad(easter.month)}-${pad(easter.day)}`,
    name: 'Páscoa',
    type: 'national_movable',
  });
  list.push({
    date: addDays(easterDate, 60),
    name: 'Corpus Christi',
    type: 'national_movable',
  });

  return list;
}

/**
 * Converte data em string YYYY-MM-DD ou Date em objeto local seguro.
 */
function parseLocalDate(date: Date | string): { year: number; month: number; day: number; dayOfWeek: number; dateStr: string } {
  if (typeof date === 'string') {
    const parts = date.trim().split(/[-/]/);
    if (parts.length === 3) {
      // If YYYY-MM-DD
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m - 1, d);
        return {
          year: y,
          month: m,
          day: d,
          dayOfWeek: dt.getDay(),
          dateStr: `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
        };
      }
      // If DD/MM/YYYY
      if (parts[2].length === 4) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        const dt = new Date(y, m - 1, d);
        return {
          year: y,
          month: m,
          day: d,
          dayOfWeek: dt.getDay(),
          dateStr: `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
        };
      }
    }
    const parsed = new Date(date);
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
      dayOfWeek: parsed.getDay(),
      dateStr: `${parsed.getFullYear()}-${(parsed.getMonth() + 1).toString().padStart(2, '0')}-${parsed.getDate().toString().padStart(2, '0')}`,
    };
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    dayOfWeek: date.getDay(),
    dateStr: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
  };
}

/**
 * Retorna se o dia é feriado e o nome do feriado.
 */
export function getHoliday(date: Date | string): HolidayInfo | null {
  const { year, dateStr } = parseLocalDate(date);
  const holidays = getBrazilHolidaysForYear(year);
  return holidays.find((h) => h.date === dateStr) || null;
}

/**
 * Retorna se a data cai em fim de semana (Sábado ou Domingo).
 */
export function isWeekend(date: Date | string): boolean {
  const { dayOfWeek } = parseLocalDate(date);
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export interface DayValidationResult {
  isBlocked: boolean;
  reason: string | null;
  isWeekend: boolean;
  holiday: HolidayInfo | null;
}

/**
 * Valida se uma data é permitida para criação de laudos/lotes.
 * Bloqueia fins de semana e feriados do Brasil.
 */
export function validateProductionDate(date: Date | string): DayValidationResult {
  const parsed = parseLocalDate(date);
  const weekend = parsed.dayOfWeek === 0 || parsed.dayOfWeek === 6;
  const holiday = getHoliday(date);

  if (weekend) {
    const dayName = parsed.dayOfWeek === 0 ? 'Domingo' : 'Sábado';
    return {
      isBlocked: true,
      reason: `Não é permitido gerar laudos aos fins de semana (${dayName}).`,
      isWeekend: true,
      holiday,
    };
  }

  if (holiday) {
    return {
      isBlocked: true,
      reason: `Não é permitido gerar laudos em feriados (${holiday.name}).`,
      isWeekend: false,
      holiday,
    };
  }

  return {
    isBlocked: false,
    reason: null,
    isWeekend: false,
    holiday: null,
  };
}
