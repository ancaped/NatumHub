import { useEffect, useState } from 'react';
import { apiFetch } from '../../geral/lib/http';
import Drawer from '../../geral/components/ui/Drawer';

type Tipo = 'montagem' | 'desmontagem';

interface LinhaErp {
  codigo: string;
  quantidade: number;
  tabela: string;
  tipoEs: string;
}

interface Previa {
  lancamento: { observacao: string; linhas: LinhaErp[] };
  ordem: { numero: string; kit: string; kits: number; jaLancadaNoErp: boolean };
}

interface Props {
  ordemId: number;
  onClose: () => void;
  /** Chamado depois de gravar no ERP, para a tela recarregar a lista. */
  onGravado: () => void;
}

async function mensagemDeErro(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.erro?.mensagem || j?.error || `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

/** Prévia e gravação da montagem/desmontagem de kit no ERP (2 passos: prévia, depois confirmar). */
export default function LancarKitErpDrawer({ ordemId, onClose, onGravado }: Props) {
  const [tipo, setTipo] = useState<Tipo>('montagem');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro('');
    setFeito('');
    apiFetch(`/kits/orders/${ordemId}/lancamento-erp?tipo=${tipo}`)
      .then(async (res) => {
        if (!vivo) return;
        if (res.ok) setPrevia(await res.json());
        else {
          setPrevia(null);
          setErro(await mensagemDeErro(res));
        }
      })
      .catch(() => vivo && setErro('Falha de rede ao buscar a prévia.'))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [ordemId, tipo]);

  const gravar = async () => {
    setGravando(true);
    setErro('');
    try {
      const res = await apiFetch(`/kits/orders/${ordemId}/lancamento-erp?tipo=${tipo}&confirmar=true`, {
        method: 'POST',
      });
      if (res.ok) {
        const j = await res.json();
        setFeito(`Gravado no ERP (registro ${j.nRegistro} de ${j.dataRegistro}).`);
        onGravado();
      } else {
        setErro(await mensagemDeErro(res));
      }
    } catch {
      setErro('Falha de rede ao gravar no ERP.');
    } finally {
      setGravando(false);
    }
  };

  const jaLancada = previa?.ordem.jaLancadaNoErp && tipo === 'montagem';

  return (
    <Drawer
      onClose={onClose}
      size="md"
      title="Lançar kit no ERP"
      subtitle={previa ? `OM ${previa.ordem.numero} · kit ${previa.ordem.kit} · ${previa.ordem.kits} un` : undefined}
      loading={carregando}
      footer={
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={onClose} className="min-h-11 px-4 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700">
            {feito ? 'Fechar' : 'Cancelar'}
          </button>
          {!feito && (
            <button
              onClick={gravar}
              disabled={gravando || !previa || !!erro}
              className="min-h-11 px-4 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-40"
            >
              {gravando ? 'Gravando…' : `Gravar ${tipo} no ERP`}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['montagem', 'desmontagem'] as Tipo[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              disabled={gravando || !!feito}
              className={`min-h-11 px-4 rounded-xl text-xs font-bold border ${
                tipo === t ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-300'
              }`}
            >
              {t === 'montagem' ? 'Montagem' : 'Desmontagem'}
            </button>
          ))}
        </div>

        {jaLancada && !feito && (
          <p className="text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-3 font-semibold">
            Esta ordem já teve a montagem lançada no ERP. O servidor recusa um segundo lançamento igual.
          </p>
        )}
        {erro && <p className="text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 p-3 font-semibold">{erro}</p>}
        {feito && (
          <p className="text-xs rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 font-semibold">{feito}</p>
        )}

        {previa && (
          <>
            <p className="text-[11px] text-zinc-500">
              Observação no ERP: <span className="font-bold text-zinc-800">{previa.lancamento.observacao}</span>
            </p>
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase">
                  <tr>
                    <th className="text-left p-2">Código</th>
                    <th className="text-left p-2">Tabela</th>
                    <th className="text-center p-2">Mov.</th>
                    <th className="text-right p-2">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.lancamento.linhas.map((l, i) => (
                    <tr key={i} className="border-t border-zinc-100">
                      <td className="p-2 font-mono font-bold text-zinc-900">{l.codigo}</td>
                      <td className="p-2 text-zinc-600">{l.tabela}</td>
                      <td className="p-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            l.tipoEs === 'E' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {l.tipoEs === 'E' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="p-2 text-right font-bold">{l.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
