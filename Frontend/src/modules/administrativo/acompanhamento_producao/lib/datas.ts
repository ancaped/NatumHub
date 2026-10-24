/** Data de hoje no fuso local, em YYYY-MM-DD (mesmo formato usado pelos seletores de data dos quadros). */
export function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLoteDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return null;
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const clean = iso.trim();
    const dateOnly = clean.split('T')[0].split(' ')[0];
    if (dateOnly.includes('-')) {
      const parts = dateOnly.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
    if (dateOnly.includes('/')) {
      const parts = dateOnly.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
      }
      return dateOnly;
    }
    const d = new Date(clean);
    return isNaN(d.getTime()) ? clean : d.toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

export function formatWeekdayAndDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const clean = iso.trim().split('T')[0].split(' ')[0];
    const [y, m, d] = clean.split('-').map(Number);
    if (!y || !m || !d) return formatDateOnly(iso);
    const date = new Date(y, m - 1, d);
    const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${weekdays[date.getDay()]}, ${String(d).padStart(2, '0')} de ${months[m - 1]} de ${y}`;
  } catch {
    return formatDateOnly(iso);
  }
}

export function formatShortWeekday(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const clean = iso.trim().split('T')[0];
    const [y, m, d] = clean.split('-').map(Number);
    if (!y || !m || !d) return '';
    const date = new Date(y, m - 1, d);
    const shortDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return shortDays[date.getDay()] || '';
  } catch {
    return '';
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

export function formatIsoDateShort(iso: string | null | undefined): string {
  return formatDateShort(iso);
}

export function formatDurationBetween(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '—';
  const start = new Date(startIso).getTime();
  if (isNaN(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(end)) return '—';
  const diffMs = end - start;
  if (diffMs < 0) return '—';

  const totalMin = Math.floor(diffMs / (1000 * 60));
  if (totalMin < 1) return '< 1 min';
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60) % 24;
  const days = Math.floor(totalMin / (60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (min > 0 || parts.length === 0) parts.push(`${min}min`);
  return parts.join(' ');
}
