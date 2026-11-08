import { UploadCloud, Plus } from 'lucide-react';
import { BotaoAcao, FilterBar, StatusBadge } from '../../geral/components/ui/ReportKit';

/** Do que cada kit é montado: lista de kits; clicar na linha abre o painel de composição. */
export default function AbaComposicaoKits({ ctx }: { ctx: any }) {
  const { handleUploadKitsConfig, kitCompSearch, kitComposicao, masterKitsList, setIsDrawerOpen, setIsNewKitModalOpen, setKitCompSearch, setSelectedDrawerKitCode, setSelectedDrawerKitDesc, uploadingKitsConfig } = ctx;

  const abrir = (kit: any) => {
    setSelectedDrawerKitCode(kit.codigo);
    setSelectedDrawerKitDesc(kit.descricao);
    setIsDrawerOpen(true);
  };
  const contar = (codigo: string) => kitComposicao.filter((row: any) => row.kit_codigo === codigo).length;
  const selo = (n: number) =>
    n > 0
      ? <StatusBadge variante="saudavel">{n} {n === 1 ? 'insumo' : 'insumos'}</StatusBadge>
      : <StatusBadge variante="ordem">Sem composição</StatusBadge>;

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <FilterBar busca={kitCompSearch} onBusca={setKitCompSearch} placeholder="Buscar kit por código ou descrição...">
        <BotaoAcao primario className="min-h-11 md:min-h-0" onClick={() => setIsNewKitModalOpen(true)}>
          <Plus size={14} /> Compor novo kit
        </BotaoAcao>
        <label className="tab-btn min-h-11 md:min-h-0 cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.75rem' }}>
          <UploadCloud size={14} />
          {uploadingKitsConfig ? 'Importando...' : 'Importar Excel (.xlsx)'}
          <input type="file" accept=".xlsx" className="hidden" onChange={handleUploadKitsConfig} disabled={uploadingKitsConfig} />
        </label>
      </FilterBar>

      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
          <span className="font-bold text-zinc-700">{masterKitsList.length} {masterKitsList.length === 1 ? 'kit' : 'kits'}</span>
          <span className="text-[11px] text-zinc-500">A estrutura vem do ERP; Excel e edição só alteram linhas manuais. Toque num kit para ver os insumos.</span>
        </div>

        {masterKitsList.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Nenhum kit encontrado.</p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-zinc-100">
              {masterKitsList.map((kit: any) => (
                <button
                  key={kit.codigo}
                  type="button"
                  onClick={() => abrir(kit)}
                  className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-zinc-50"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[11px] font-bold text-zinc-500">{kit.codigo}</span>
                    <span className="block text-xs font-bold text-zinc-900 break-words">{kit.descricao}</span>
                  </span>
                  <span className="shrink-0">{selo(contar(kit.codigo))}</span>
                </button>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="data-table compacta w-full text-left">
                <thead>
                  <tr>
                    <th style={{ width: '14%' }}>Código</th>
                    <th>Kit</th>
                    <th style={{ width: '18%' }}>Composição</th>
                  </tr>
                </thead>
                <tbody>
                  {masterKitsList.map((kit: any) => (
                    <tr key={kit.codigo} onClick={() => abrir(kit)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                      <td className="font-mono font-bold text-zinc-900">{kit.codigo}</td>
                      <td className="font-bold text-zinc-900">{kit.descricao}</td>
                      <td>{selo(contar(kit.codigo))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
