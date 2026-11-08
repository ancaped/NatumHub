import React from 'react';
import { CalendarClock, Scale, FlaskConical, Tag, Layers, CheckSquare, Boxes, Building2, Table, Calendar as CalendarIcon, Settings } from 'lucide-react';

export interface calcularSidebarItemsCtx {
  filterCounts: { todos: number; aberto: number; concluidoEa: number; pesagem: number; produzido: number; liberadoEnvase: number; envase: number; rotulagem: number; espera: number; finalizada: number; pendente: number; };
  mode: 'planejamento' | 'administrativo';
  totalKitsAberto: number;
  totalTerceirizadosAberto: number;
}

export function calcularSidebarItems({ filterCounts, mode, totalKitsAberto, totalTerceirizadosAberto }: calcularSidebarItemsCtx) {
    if (mode === 'planejamento') {
      return [
        {
          id: 'planejamento_semanal',
          label: 'Planejamento Semanal',
          icon: CalendarClock,
        },
        {
          id: 'quadro_pesagem',
          label: 'Quadro de Pesagem',
          icon: Scale,
        },
        {
          id: 'quadro_producao',
          label: 'Quadro de Produção',
          icon: FlaskConical,
        },
        {
          id: 'quadro_rotulagem',
          label: 'Quadro de Rotulagem',
          icon: Tag,
        },
        {
          id: 'quadro_envase',
          label: 'Quadro de Envase',
          icon: Layers,
        },
        {
          id: 'quadro_ordens',
          label: 'Quadro de Ordens',
          icon: CheckSquare,
        },
        {
          id: 'kits',
          label: 'Ordens de Kits',
          icon: Boxes,
          badge: totalKitsAberto > 0 ? totalKitsAberto : undefined,
        },
        {
          id: 'terceirizados',
          label: 'Terceirizados',
          icon: Building2,
          badge: totalTerceirizadosAberto > 0 ? totalTerceirizadosAberto : undefined,
        },
      ];
    }

    return [
      {
        id: 'lotes',
        label: 'Status de Lotes',
        icon: Table,
        badge: filterCounts.aberto > 0 ? filterCounts.aberto : undefined,
      },
      {
        id: 'terceirizados',
        label: 'Terceirizados',
        icon: Building2,
        badge: totalTerceirizadosAberto > 0 ? totalTerceirizadosAberto : undefined,
      },
      {
        id: 'kits',
        label: 'Ordens de Kits',
        icon: Boxes,
        badge: totalKitsAberto > 0 ? totalKitsAberto : undefined,
      },
      {
        id: 'quadro_pesagem',
        label: 'Quadro de Pesagem',
        icon: Scale,
      },
      {
        id: 'quadro_producao',
        label: 'Quadro de Produção',
        icon: FlaskConical,
      },
      {
        id: 'quadro_rotulagem',
        label: 'Quadro de Rotulagem',
        icon: Tag,
      },
      {
        id: 'quadro_envase',
        label: 'Quadro de Envase',
        icon: Layers,
      },
      {
        id: 'quadro_ordens',
        label: 'Quadro de Ordens',
        icon: CheckSquare,
      },
      {
        id: 'calendar',
        label: 'Calendário',
        icon: CalendarIcon,
      },
      {
        id: 'configuracoes',
        label: 'Configurações',
        icon: Settings,
      },
    ];
  }
