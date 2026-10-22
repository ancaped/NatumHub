import React from 'react';
import { Search } from 'lucide-react';

/**
 * Peças do padrão visual da Saúde do Estoque (classes globais de index.css: summary-card, tab-btn,
 * panel-card, data-table, status-badge). Telas de relatório e de planejamento usam estas mesmas peças.
 */

export function ReportHeader({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'hsl(var(--text-primary-hsl))' }}>{titulo}</h2>
        {subtitulo && <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 1 }}>{subtitulo}</p>}
      </div>
      {acoes && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{acoes}</div>}
    </div>
  );
}

/** Botão no estilo `tab-btn`; `primario` = preto sólido (ex.: Imprimir). */
export function BotaoAcao({
  children,
  onClick,
  primario,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primario?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="tab-btn"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        fontSize: '0.75rem',
        ...(primario ? { backgroundColor: 'hsl(var(--primary-hsl))', color: '#ffffff', fontWeight: 700 } : {}),
      }}
    >
      {children}
    </button>
  );
}

export interface AbaRelatorio {
  id: string;
  label: string;
  icone?: React.ReactNode;
  contagem?: number;
}

export function ReportTabs({ abas, ativa, onChange }: { abas: AbaRelatorio[]; ativa: string; onChange: (id: string) => void }) {
  return (
    <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`tab-btn ${ativa === a.id ? 'active' : ''}`}
          onClick={() => onChange(a.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '5px 12px', fontSize: '0.78rem' }}
        >
          {a.icone} {a.label}
          {a.contagem !== undefined ? ` (${a.contagem})` : ''}
        </button>
      ))}
    </div>
  );
}

/** Barra de busca + filtros (selects) no estilo da Saúde do Estoque. */
export function FilterBar({
  busca,
  onBusca,
  placeholder,
  children,
}: {
  busca: string;
  onBusca: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel-card" style={{ marginBottom: 10, padding: '8px 12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="search-input-wrapper" style={{ minWidth: 220, flex: '1 1 auto' }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="search-input"
            style={{ fontSize: '0.78rem', padding: '5px 8px 5px 28px' }}
            placeholder={placeholder}
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
      </div>
    </div>
  );
}

export function FiltroSelect({
  value,
  onChange,
  opcoes,
  icone,
}: {
  value: string;
  onChange: (v: string) => void;
  opcoes: Array<{ valor: string; rotulo: string }>;
  icone?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {icone}
      <select className="select-filter" style={{ fontSize: '0.75rem', padding: '3px 6px' }} value={value} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

export type VarianteBadge = 'critico' | 'ordem' | 'saudavel' | 'abundante' | 'aguardando' | 'descontinuado' | 'apoio';

export function StatusBadge({ variante, children, title }: { variante: VarianteBadge; children: React.ReactNode; title?: string }) {
  return (
    <span className={`status-badge ${variante}`} title={title}>
      {children}
    </span>
  );
}

/** Painel com a tabela `data-table` da Saúde do Estoque. */
export function TabelaPainel({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
      <table className="data-table compacta">{children}</table>
    </div>
  );
}
