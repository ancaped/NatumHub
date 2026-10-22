import React, { useCallback, useEffect, useState } from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao, StatusBadge } from '../../../geral/components/ui/ReportKit';
import { apiJson } from '../../../geral/lib/http';

/**
 * Insumos "sem controle de estoque": só o Edson marca ou desmarca (nunca automático).
 * Marcado = a cobertura e o relatório de faltas não acusam falta dele; Compras/MRP não mudam.
 */

export interface InsumoMarcado {
  codigo: string;
  descricao: string;
  unidade?: string | null;
  marcadoPor?: string | null;
  marcadoEm: string;
}

interface Previa {
  marcadoAgora: boolean;
  ordensPlanejadasQueUsam: number;
}

export const ENDPOINT_SEM_CONTROLE = '/api/producao/insumos-sem-controle';

/** Confirmação em 2 passos: mostra a prévia (nada é gravado) e só grava no OK. */
export function SemControleConfirmar({
  codigo,
  descricao,
  marcar,
  onClose,
  onDone,
}: {
  codigo: string;
  descricao: string;
  marcar: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Previa>(ENDPOINT_SEM_CONTROLE, { method: 'PUT', body: JSON.stringify({ codigo, marcado: marcar }) })
      .then(setPrevia)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível calcular a prévia.'));
  }, [codigo, marcar]);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await apiJson(ENDPOINT_SEM_CONTROLE, { method: 'PUT', body: JSON.stringify({ codigo, marcado: marcar, confirmar: true }) });
      onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title={marcar ? 'Marcar sem controle de estoque' : 'Voltar a controlar o estoque'}
      subtitle={`${descricao} · ${codigo}`}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: 12 }}>
          <BotaoAcao onClick={onClose}>Cancelar</BotaoAcao>
          <BotaoAcao primario onClick={confirmar} disabled={salvando || !previa}>
            {marcar ? 'OK, marcar' : 'OK, voltar a controlar'}
          </BotaoAcao>
        </div>
      }
    >
      <div style={{ padding: 16, fontSize: '0.8rem' }}>
        {marcar ? (
          <p style={{ marginBottom: 8 }}>
            O Nexus <strong>deixa de acusar falta</strong> deste insumo na cobertura e no relatório de faltas. Use para o que a fábrica produz
            ou que o ERP não controla (ex.: água).
          </p>
        ) : (
          <p style={{ marginBottom: 8 }}>O Nexus volta a comparar este insumo com o estoque do ERP e a acusar falta.</p>
        )}
        {previa && (
          <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: 8 }}>
            {previa.ordensPlanejadasQueUsam} ordem(ns) planejada(s) usam este insumo na fórmula.
          </p>
        )}
        <p style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>
          Só você marca ou desmarca; nada é marcado sozinho. Compras/MRP não mudam. A ação fica registrada com o seu nome.
        </p>
        {erro && <p style={{ fontSize: '0.72rem', color: 'hsl(var(--danger-hsl))', marginTop: 8 }}>{erro}</p>}
      </div>
    </Drawer>
  );
}

/** Lista dos marcados, com "Desmarcar" (também em 2 passos). */
export function TabelaSemControle({ versao, onMudou }: { versao?: number; onMudou?: () => void }) {
  const [lista, setLista] = useState<InsumoMarcado[]>([]);
  const [desmarcar, setDesmarcar] = useState<InsumoMarcado | null>(null);

  const carregar = useCallback(async () => {
    try {
      const l = await apiJson<InsumoMarcado[]>(ENDPOINT_SEM_CONTROLE);
      setLista(Array.isArray(l) ? l : []);
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  return (
    <>
      <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="data-table compacta">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Situação</th>
              <th>Marcado por</th>
              <th style={{ textAlign: 'center' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>
                  Nenhum insumo marcado. Marque na tabela de faltas, no botão "Sem controle".
                </td>
              </tr>
            )}
            {lista.map((m) => (
              <tr key={m.codigo}>
                <td>
                  <div style={{ fontWeight: 600 }}>{m.descricao || m.codigo}</div>
                  <span className="product-code" style={{ fontSize: '0.65rem' }}>{m.codigo}</span>
                </td>
                <td><StatusBadge variante="descontinuado">Sem controle</StatusBadge></td>
                <td style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                  {m.marcadoPor ?? '—'} · {m.marcadoEm}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button type="button" className="tab-btn" style={{ padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => setDesmarcar(m)}>
                    Desmarcar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {desmarcar && (
        <SemControleConfirmar
          codigo={desmarcar.codigo}
          descricao={desmarcar.descricao || desmarcar.codigo}
          marcar={false}
          onClose={() => setDesmarcar(null)}
          onDone={() => {
            setDesmarcar(null);
            carregar();
            onMudou?.();
          }}
        />
      )}
    </>
  );
}
