import React, { useEffect, useState } from 'react';
import Drawer from '../../geral/components/ui/Drawer';
import { BotaoAcao } from '../../geral/components/ui/ReportKit';
import { apiJson } from '../../geral/lib/http';

interface Previa {
  statusDoLote: string;
  motivoEspera?: string | null;
  dataEmEspera?: string | null;
  etapasAfetadas: string[];
  temOQueLimpar: boolean;
}

const ROTULO_ETAPA: Record<string, string> = { pesagem: 'Pesagem', producao: 'Produção', rotulagem: 'Rotulagem', envase: 'Envase' };

/** Tira a marca "Em Espera" que sobrou no lote (2 passos: prévia e OK; o status e as datas do lote não mudam). */
export default function TirarEsperaDrawer({ lote, onClose, onDone }: { lote: string; onClose: () => void; onDone: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const url = `/api/administrativo/lote-status/${encodeURIComponent(lote)}/limpar-espera`;

  useEffect(() => {
    apiJson<Previa>(url, { method: 'POST', body: JSON.stringify({ confirmar: false }) })
      .then(setPrevia)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível ler o lote.'));
  }, [url]);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await apiJson(url, { method: 'POST', body: JSON.stringify({ confirmar: true }) });
      onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title="Tirar Em Espera"
      subtitle={`Lote ${lote}`}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: 12 }}>
          <BotaoAcao onClick={onClose}>Cancelar</BotaoAcao>
          <BotaoAcao primario onClick={confirmar} disabled={salvando || !previa || !previa.temOQueLimpar}>
            OK, tirar Em Espera
          </BotaoAcao>
        </div>
      }
    >
      <div style={{ padding: 16, fontSize: '0.8rem' }}>
        {previa && (
          <>
            <div className="panel-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
              <table className="data-table compacta">
                <tbody>
                  <tr><td style={{ fontWeight: 600 }}>Status do lote</td><td>{previa.statusDoLote}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Motivo da espera</td><td>{previa.motivoEspera || '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Em espera desde</td><td>{previa.dataEmEspera || '—'}</td></tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Etapas com marca de espera</td>
                    <td>{previa.etapasAfetadas.length ? previa.etapasAfetadas.map((e) => ROTULO_ETAPA[e] ?? e).join(', ') : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {previa.temOQueLimpar ? (
              <p style={{ marginBottom: 8 }}>
                Ao confirmar, o motivo, a data de espera e a marca de espera das etapas são apagados. <strong>O status e as datas do lote não mudam.</strong>
              </p>
            ) : (
              <p style={{ marginBottom: 8 }}>Este lote não tem mais marca de Em Espera.</p>
            )}
            <p style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>A ação fica no histórico do lote e na auditoria, com o seu nome.</p>
          </>
        )}
        {erro && <p style={{ fontSize: '0.72rem', color: 'hsl(var(--danger-hsl))', marginTop: 8 }}>{erro}</p>}
      </div>
    </Drawer>
  );
}
