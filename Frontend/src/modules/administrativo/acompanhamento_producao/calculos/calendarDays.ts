import React from 'react';
import { type HolidayInfo, isWeekend, getHoliday } from '../../../geral/lib/brazilHolidays';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface calcularCalendarDaysCtx {
  currentMonth: number;
  currentYear: number;
  lotesByDate: Map<string, AcompanhamentoLote[]>;
  today: Date;
}

export function calcularCalendarDays({ currentMonth, currentYear, lotesByDate, today }: calcularCalendarDaysCtx) {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay();
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: Array<{
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      holiday: HolidayInfo | null;
      items: AcompanhamentoLote[];
      count: number;
      totalKg: number;
      openCount: number;
      completedCount: number;
    }> = [];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Mês Anterior
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateIso = `${prevYear}-${pad(prevMonth + 1)}-${pad(dayNum)}`;
      const items = lotesByDate.get(dateIso) || [];
      const open = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
      const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: isWeekend(dateIso),
        holiday: getHoliday(dateIso),
        items,
        count: items.length,
        totalKg,
        openCount: open,
        completedCount: items.length - open,
      });
    }

    // Mês Atual
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      const items = lotesByDate.get(dateIso) || [];
      const open = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
      const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: true,
        isToday: dateIso === todayIso,
        isWeekend: isWeekend(dateIso),
        holiday: getHoliday(dateIso),
        items,
        count: items.length,
        totalKg,
        openCount: open,
        completedCount: items.length - open,
      });
    }

    // Próximo Mês
    const totalSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - days.length;
    for (let dayNum = 1; dayNum <= remainingSlots; dayNum++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateIso = `${nextYear}-${pad(nextMonth + 1)}-${pad(dayNum)}`;
      const items = lotesByDate.get(dateIso) || [];
      const open = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
      const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: isWeekend(dateIso),
        holiday: getHoliday(dateIso),
        items,
        count: items.length,
        totalKg,
        openCount: open,
        completedCount: items.length - open,
      });
    }

    return days;
  }
