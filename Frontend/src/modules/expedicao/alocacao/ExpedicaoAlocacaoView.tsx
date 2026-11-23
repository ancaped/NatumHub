import React, { useCallback, useEffect, useState } from 'react';
import { Download, Grid3X3, ListOrdered, RefreshCw, Settings, Upload } from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { BotaoAcao, ReportHeader, ReportTabs } from '../../geral/components/ui/ReportKit';
import { useAviso } from '../../geral/components/ui/Aviso';
import { apiJson } from '../../geral/lib/http';
import { getAuthUser } from '../../geral/lib/auth';
import { canEditView } from '../../geral/lib/modules/permissions';
import { syncCurrentPageForView } from '../../geral/lib/viewLabels';
import type { LinhaBase } from '../../geral/lib/linhas';
import { usePreviaServidor } from '../../producao/lib/usePreviaServidor';
import { fetchPainelAlocacao, moverAlocacao } from './api';
import { baixarPlanilhaAlocacao } from './exportarPlanilha';
import { MapaEstantesTab } from './MapaEstantesTab';
import { DimensionamentoTab } from './DimensionamentoTab';
import { CadastrosTab } from './CadastrosTab';
import { PosicaoDrawer } from './PosicaoDrawer';
import { ProdutoAlocacaoDrawer } from './ProdutoAlocacaoDrawer';
import { SugestaoDrawer } from './SugestaoDrawer';
import { ImportarPlanilhaDrawer } from './ImportarPlanilhaDrawer';
import type { PainelAlocacaoResponse, ProdutoDimensao } from './types';

type TabId = 'mapa' | 'dimensionamento' | 'cadastros';

const SIDEBAR: SidebarItem[] = [
  { id: 'mapa', label: 'Mapa das Estantes', icon: Grid3X3 },
  { id: 'dimensionamento', label: 'Dimensionamento ABC', icon: ListOrdered },
  { id: 'cadastros', label: 'Cadastros & Conferência', icon: Settings },
];

export default function ExpedicaoAlocacaoView({
  onBackToHub,
}: {
  onBackToHub: () => void;
}) {
  const [aba, setAba] = useState<TabId>('mapa');
  const [cadSubSecao, setCadSubSecao] = useState<
    'conferencia' | 'caixas' | 'atacadistas' | 'estruturas'
  >('conferencia');

  const [estruturaId, setEstruturaId] = useState<string>('');
  const [janelaMeses, setJanelaMeses] = useState<number>(12);
  const [metaMeses, setMetaMeses] = useState<number>(2);
  const [usarMetaLinha, setUsarMetaLinha] = useState<boolean>(false);
  const [incluirInativos, setIncluirInativos] = useState<boolean>(false);

  const [painel, setPainel] = useState<PainelAlocacaoResponse | null>(null);
  const [linhasConfigs, setLinhasConfigs] = useState<LinhaBase[]>([]);
  const [produtosFiltradosExport, setProdutosFiltradosExport] = useState<
    ProdutoDimensao[] | undefined
  >(undefined);
  const [carregando, setCarregando] = useState<boolean>(true);

  const [posicaoIdSelecionada, setPosicaoIdSelecionada] = useState<string | null>(null);
  const [produtoCodigoSelecionado, setProdutoCodigoSelecionado] = useState<string | null>(null);
  const [sugestaoOpen, setSugestaoOpen] = useState<boolean>(false);
  const [importarOpen, setImportarOpen] = useState<boolean>(false);

  const { avisar, aviso } = useAviso();
  const { pedir: pedirPrevia, elemento: elementoPrevia } = usePreviaServidor(avisar);
  const canEdit = canEditView(getAuthUser(), 'expedicao_alocacao');

  useEffect(() => {
    syncCurrentPageForView('expedicao_alocacao');
  }, []);

  useEffect(() => {
    apiJson<LinhaBase[]>('/api/configs')
      .then(setLinhasConfigs)
      .catch(() => setLinhasConfigs([]));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await fetchPainelAlocacao({
        estruturaId: estruturaId || undefined,
        janelaMeses,
        metaMeses,
        usarMetaLinha,
        incluirInativos,
      });
      setPainel(dados);
      if (!estruturaId && dados.estruturaAtivaId) {
        setEstruturaId(dados.estruturaAtivaId);
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao carregar Alocação da Expedição.', 'erro');
    } finally {
      setCarregando(false);
    }
  }, [estruturaId, janelaMeses, metaMeses, usarMetaLinha, incluirInativos, avisar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const posicaoAtiva =
    painel?.posicoes.find((p) => p.id === posicaoIdSelecionada) ?? null;
  const produtoAtivo =
    painel?.produtos.find((p) => p.codigo === produtoCodigoSelecionado) ?? null;

  const exportarExcel = () => {
    if (!painel) return;
    try {
      const arquivo = baixarPlanilhaAlocacao(painel, produtosFiltradosExport);
      avisar(`Planilha ${arquivo} gerada.`, 'sucesso');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao exportar planilha.', 'erro');
    }
  };

  const executarMovimento = useCallback(
    async (alocacaoId: string, destinoPosicaoId: string, copiar = false) => {
      try {
        const res = (await moverAlocacao(
          { alocacaoId, destinoPosicaoId, copiar },
          true,
        )) as {
          produtoCodigo?: string;
          origemPosicaoCodigo?: string;
          destinoPosicaoCodigo?: string;
        };
        avisar(
          `${res.produtoCodigo ?? 'Produto'} ${copiar ? 'duplicado' : 'movido'} de ${
            res.origemPosicaoCodigo ?? 'origem'
          } para ${res.destinoPosicaoCodigo ?? 'destino'}.`,
          'sucesso',
        );
        await carregar();
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Erro ao mover alocação.', 'erro');
      }
    },
    [avisar, carregar],
  );

  const estruturaAtivaObj = painel?.estruturas.find((e) => e.id === painel.estruturaAtivaId);

  const subtitulo = painel
    ? `${painel.resumo.alocados}/${painel.resumo.totalProdutos} produtos alocados · ${painel.resumo.posicoesOcupadas}/${painel.resumo.totalPosicoes} posições ocupadas (${painel.resumo.ocupacaoMediaPct.toFixed(0)}%)`
    : 'Planejamento dinâmico de endereços no pátio/estantes, Varejo × Atacado e conferência de caixas';

  return (
    <AppLayout
      moduleTitle="Alocação e Endereços"
      onBackToHub={onBackToHub}
      sidebarItems={SIDEBAR}
      activeTab={aba}
      onTabChange={(id) => setAba(id as TabId)}
    >
      {aviso}
      {elementoPrevia}

      <ReportHeader
        titulo="Expedição · Alocação e Endereços"
        subtitulo={subtitulo}
        acoes={
          <div className="flex flex-wrap gap-1.5">
            {canEdit && (
              <BotaoAcao
                onClick={() => setImportarOpen(true)}
                disabled={!painel || !painel.estruturaAtivaId}
              >
                <Upload className="h-3.5 w-3.5" />
                Importar .xlsx
              </BotaoAcao>
            )}
            <BotaoAcao onClick={exportarExcel} disabled={!painel} primario>
              <Download className="h-3.5 w-3.5" />
              Exportar .xlsx
            </BotaoAcao>
            <BotaoAcao onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </BotaoAcao>
          </div>
        }
      />

      <ReportTabs
        ativa={aba}
        onChange={(id) => setAba(id as TabId)}
        abas={[
          {
            id: 'mapa',
            label: 'Mapa das Estantes',
            contagem: painel?.resumo.posicoesOcupadas,
          },
          {
            id: 'dimensionamento',
            label: 'Dimensionamento ABC',
            contagem: painel?.resumo.totalProdutos,
          },
          {
            id: 'cadastros',
            label: 'Cadastros & Conferência',
            contagem: painel
              ? painel.resumo.semCaixa + painel.resumo.semQtdeCx
              : undefined,
          },
        ]}
      />

      {carregando && !painel ? (
        <div className="panel-card p-10 text-center text-sm text-zinc-500">
          Carregando alocação, vendas Varejo × Atacado e caixas do ERP...
        </div>
      ) : painel ? (
        <>
          {aba === 'mapa' && (
            <MapaEstantesTab
              estruturas={painel.estruturas}
              estruturaAtivaId={painel.estruturaAtivaId}
              onChangeEstrutura={setEstruturaId}
              posicoes={painel.posicoes}
              produtos={painel.produtos}
              canEdit={canEdit}
              onSelectPosicao={(pos) => setPosicaoIdSelecionada(pos.id)}
              onAbrirProduto={(p) => setProdutoCodigoSelecionado(p.codigo)}
              onMoverAlocacao={(alocId, destId) => executarMovimento(alocId, destId, false)}
              onGerenciarEstruturas={() => {
                setCadSubSecao('estruturas');
                setAba('cadastros');
              }}
            />
          )}

          {aba === 'dimensionamento' && (
            <DimensionamentoTab
              produtos={painel.produtos}
              linhasConfigs={linhasConfigs}
              janelaMeses={painel.janelaMeses}
              metaMeses={painel.metaMeses}
              usarMetaLinha={painel.usarMetaLinha}
              incluirInativos={incluirInativos}
              canEdit={canEdit}
              onChangeJanela={setJanelaMeses}
              onChangeMeta={(m, usarLinha) => {
                setMetaMeses(m);
                setUsarMetaLinha(usarLinha);
              }}
              onChangeIncluirInativos={setIncluirInativos}
              onAbrirProduto={(p) => setProdutoCodigoSelecionado(p.codigo)}
              onAbrirSugestao={() => setSugestaoOpen(true)}
              onFiltroProdutosChange={setProdutosFiltradosExport}
            />
          )}

          {aba === 'cadastros' && (
            <CadastrosTab
              subSecaoInicial={cadSubSecao}
              estruturaAtivaId={painel.estruturaAtivaId}
              estruturas={painel.estruturas}
              posicoes={painel.posicoes}
              caixas={painel.caixas}
              atacadistas={painel.atacadistas}
              produtos={painel.produtos}
              linhasConfigs={linhasConfigs}
              insumosCaixaErp={painel.insumosCaixaErp}
              janelaMeses={painel.janelaMeses}
              canEdit={canEdit}
              onSaved={carregar}
              onAbrirProduto={(p) => setProdutoCodigoSelecionado(p.codigo)}
              avisar={avisar}
              pedirPrevia={pedirPrevia}
            />
          )}
        </>
      ) : null}

      <PosicaoDrawer
        posicao={posicaoAtiva}
        posicoes={painel?.posicoes ?? []}
        produtos={painel?.produtos ?? []}
        caixas={painel?.caixas ?? []}
        canEdit={canEdit}
        onClose={() => setPosicaoIdSelecionada(null)}
        onSaved={carregar}
        onMoverAlocacao={executarMovimento}
        avisar={avisar}
        pedirPrevia={pedirPrevia}
      />

      <ProdutoAlocacaoDrawer
        produto={produtoAtivo}
        caixas={painel?.caixas ?? []}
        posicoes={painel?.posicoes ?? []}
        janelaMeses={painel?.janelaMeses ?? janelaMeses}
        canEdit={canEdit}
        onClose={() => setProdutoCodigoSelecionado(null)}
        onSaved={carregar}
        onAbrirPosicao={(posId) => {
          setProdutoCodigoSelecionado(null);
          setPosicaoIdSelecionada(posId);
        }}
        avisar={avisar}
      />

      <SugestaoDrawer
        open={sugestaoOpen}
        estruturaId={painel?.estruturaAtivaId ?? ''}
        janelaMeses={janelaMeses}
        metaMeses={metaMeses}
        usarMetaLinha={usarMetaLinha}
        linhasConfigs={linhasConfigs}
        onClose={() => setSugestaoOpen(false)}
        onApplied={carregar}
        avisar={avisar}
      />

      <ImportarPlanilhaDrawer
        open={importarOpen}
        estruturaId={painel?.estruturaAtivaId ?? ''}
        estruturaNome={estruturaAtivaObj?.nome ?? painel?.estruturaAtivaId ?? ''}
        onClose={() => setImportarOpen(false)}
        onApplied={carregar}
        avisar={avisar}
      />
    </AppLayout>
  );
}
