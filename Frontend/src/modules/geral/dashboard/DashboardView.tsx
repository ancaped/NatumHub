import React from 'react';
import { 
  Boxes, ShoppingCart, Activity, FlaskConical, ArrowRight, ArrowLeft,
  Settings, Database, RefreshCw, Upload, Download, Loader2, Check, X, Globe,
  FileText, ClipboardList, CheckCircle2, Palette, Tag, Layers, TrendingUp, DollarSign,
  ClipboardCheck, Briefcase, Truck, Warehouse, Calculator
} from 'lucide-react';
import { canAccessView } from '../lib/modules/permissions';
import type { AuthUser } from '../lib/auth';

interface DashboardViewProps {
  view: string;
  setView: (view: any) => void;
  currentUser: any;
  handleLogout: () => void;
  fetchSqlConfig: () => void;
  appName: string;
}

export default function DashboardView({
  view,
  setView,
  currentUser,
  handleLogout,
  fetchSqlConfig,
  appName,
}: DashboardViewProps) {
  const user = currentUser as AuthUser | null;
  const allow = (v: string) => canAccessView(user, v);

  if (view === 'estoque_hub') {
    return (
      <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-zinc-50 font-sans text-zinc-900">

        <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-6xl w-full mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="text-center space-y-2 relative w-full">
            <button
              onClick={() => setView('hub')}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white border border-zinc-200 hover:bg-zinc-100 px-4 py-2 rounded-xl text-xs font-bold text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-98 no-print"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Módulos de Estoque</h2>
            <p className="text-sm text-zinc-500">Selecione o inventário específico para consulta e movimentações.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 w-full max-w-5xl">
            {allow('estoque_materia_prima') && (
            <button 
              onClick={() => setView('estoque_materia_prima')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Matéria-Prima</h3>
                  <p className="text-sm text-zinc-500 mt-1">Insumos químicos — saldo, movimentações e contagens.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar Matéria-Prima <ArrowRight className="h-4 w-4" />
              </div>
            </button>
            )}

            {allow('estoque_embalagens') && (
            <button 
              onClick={() => setView('estoque_embalagens')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Embalagens</h3>
                  <p className="text-sm text-zinc-500 mt-1">Frascos, rótulos e tampas — consulta de estoque.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar Embalagens <ArrowRight className="h-4 w-4" />
              </div>
            </button>
            )}

            {allow('estoque_coloracao') && (
            <button 
              onClick={() => setView('estoque_coloracao')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <Palette className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Coloração</h3>
                  <p className="text-sm text-zinc-500 mt-1">Produtos de coloração — estoque e lotes.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar Coloração <ArrowRight className="h-4 w-4" />
              </div>
            </button>
            )}

            {allow('estoque_apoio') && (
            <button 
              onClick={() => setView('estoque_apoio')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <Tag className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Material de Apoio</h3>
                  <p className="text-sm text-zinc-500 mt-1">Materiais de apoio — saldo e movimentações.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar Material de Apoio <ArrowRight className="h-4 w-4" />
              </div>
            </button>
            )}
          </div>
        </main>

        <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
          &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
        </footer>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-zinc-50 font-sans text-zinc-900">

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-6xl w-full mx-auto">
        {view === 'hub' ? (
          <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Selecione o Módulo</h2>
              <p className="text-sm text-zinc-500">Escolha a área do ecossistema Natum que deseja acessar.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 w-full">
              {allow('estoque_hub') && (
              <button 
                onClick={() => setView('estoque_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Boxes className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Estoque</h3>
                    <p className="text-sm text-zinc-500 mt-1">Níveis de insumos, matérias-primas, produtos acabados, formulações e histórico de movimentações.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('almoxarifado_hub') && (
              <button 
                onClick={() => setView('almoxarifado_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Warehouse className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Almoxarifado</h3>
                    <p className="text-sm text-zinc-500 mt-1">Consumíveis, supermercado, peças, equipamentos e manutenções.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('producao_hub') && (
              <button 
                onClick={() => setView('producao_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Activity className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Produção</h3>
                    <p className="text-sm text-zinc-500 mt-1">Gestão de estoques, alertas de segurança e controle microbiológico de lotes.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('compras_hub') && (
              <button 
                onClick={() => setView('compras_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Compras</h3>
                    <p className="text-sm text-zinc-500 mt-1">Planejamento de demandas, cotações de fornecedores e controle de notas fiscais.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('vendas_hub') && (
              <button 
                onClick={() => setView('vendas_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Vendas</h3>
                    <p className="text-sm text-zinc-500 mt-1">Estatísticas de vendas, desempenho YoY e integração futura com marketplaces (Olist).</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('qualidade_hub') && (
              <button 
                onClick={() => setView('qualidade_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <ClipboardCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Qualidade</h3>
                    <p className="text-sm text-zinc-500 mt-1">BPF, POPs, treinamentos e rastreabilidade auditável.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('expedicao_hub') && (
              <button 
                onClick={() => setView('expedicao_hub')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Truck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Expedição</h3>
                    <p className="text-sm text-zinc-500 mt-1">E-commerce, separação, conferência e despacho de pedidos.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('administrativo') && (
              <button 
                onClick={() => setView('administrativo')}
                className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Briefcase className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Administrativo</h3>
                    <p className="text-sm text-zinc-500 mt-1">Catálogo mestre: linhas comerciais, status e categorias de produto.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}

              {allow('financeiro') && (
              <button 
                onClick={() => setView('financeiro')}
                className="group relative bg-white border border-zinc-200 hover:border-emerald-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl w-fit group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <DollarSign className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Financeiro</h3>
                    <p className="text-sm text-zinc-500 mt-1">Contas a pagar e a receber integradas ao Tiny ERP. Fluxo de caixa mensal e controle de inadimplência.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Entrar no Módulo <ArrowRight className="h-4 w-4" />
                </div>
              </button>
              )}
            </div>
          </div>
        ) : view === 'producao_hub' ? (
          <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-4 text-left">
              <button 
                onClick={() => setView('hub')}
                className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer"
                title="Voltar ao Início"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">Módulo de Produção</h2>
                <p className="text-xs text-zinc-500">Selecione a ferramenta de produção desejada.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
              {allow('producao') && (
              <button 
                onClick={() => setView('producao')}
                className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Gerenciamento de Produção</h3>
                    <p className="text-xs text-zinc-500 mt-1">Visualize níveis de produto acabado, defina overrides de segurança e lance ordens de fabricação.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Produção <ArrowRight className="h-3 w-3" />
                </div>
              </button>
              )}

              {allow('producao_bases') && (
              <button 
                onClick={() => setView('producao_bases')}
                className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Gestão de Bases</h3>
                    <p className="text-xs text-zinc-500 mt-1">Composições de bases, produtos vinculados e estoque de intermediários.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Bases <ArrowRight className="h-3 w-3" />
                </div>
              </button>
              )}

              {allow('producao_lotes') && (
              <button 
                onClick={() => setView('producao_lotes')}
                className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Lotes de Produção</h3>
                    <p className="text-xs text-zinc-500 mt-1">Lotes ERP, conferência de pesagem/envase e resolução de erros.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Lotes <ArrowRight className="h-3 w-3" />
                </div>
              </button>
              )}

              {allow('fisco_quimica') && (
              <button 
                onClick={() => setView('fisco_quimica')}
                className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Análise Físico-Química</h3>
                    <p className="text-xs text-zinc-500 mt-1">Controle de qualidade físico-químico. Registre análises de pH, viscosidade e densidade, e calcule correções em lote.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Laboratório <ArrowRight className="h-3 w-3" />
                </div>
              </button>
              )}

              {allow('microbiologia') && (
              <button 
                onClick={() => setView('microbiologia')}
                className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <FlaskConical className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Análise Microbiológica</h3>
                    <p className="text-xs text-zinc-500 mt-1">Controle de qualidade laboratorial. Registre análises, emita laudos microbiológicos e gerencie o histórico de lotes.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Laboratório <ArrowRight className="h-3 w-3" />
                </div>
              </button>
              )}

              {allow('montagem_kits') && (
              <button 
                onClick={() => setView('montagem_kits')}
                className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Kits</h3>
                    <p className="text-xs text-zinc-500 mt-1">Acompanhe falta de componentes, gere ordens de montagem, controle lotes individuais e imprima fichas de produção.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                  Acessar Ordens <ArrowRight className="h-3 w-3" />
                </div>
              </button>
              )}
            </div>
          </div>
        ) : view === 'compras_hub' ? (
          <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-4 text-left">
              <button 
                onClick={() => setView('hub')}
                className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer"
                title="Voltar ao Início"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">Módulo de Compras</h2>
                <p className="text-xs text-zinc-500">Selecione a ferramenta de compras desejada.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
              {allow('compras_materia_prima') && (
              <button onClick={() => setView('compras_materia_prima')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Boxes className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Matéria-Prima</h3><p className="text-xs text-zinc-500 mt-1">Planeje o estoque de matérias-primas químicas, calcule demandas automáticas e gerencie especificações de compras.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Matéria-Prima <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_embalagens') && (
              <button onClick={() => setView('compras_embalagens')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Layers className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Embalagens</h3><p className="text-xs text-zinc-500 mt-1">Monitore o estoque e planeje a compra de frascos, potes, tampas, caixas e materiais gráficos.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Embalagens <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_coloracao') && (
              <button onClick={() => setView('compras_coloracao')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Palette className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Coloração</h3><p className="text-xs text-zinc-500 mt-1">Gerencie a aquisição de colorações, tonalizantes e gloss terceirizados por unidade.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Coloração <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_apoio') && (
              <button onClick={() => setView('compras_apoio')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Tag className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Material de Apoio</h3><p className="text-xs text-zinc-500 mt-1">Controle e planeje compras de materiais auxiliares de vendas como camisas, aventais e escovas.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Material de Apoio <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_quotations') && (
              <button onClick={() => setView('compras_quotations')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><ShoppingCart className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Cotações Gerais</h3><p className="text-xs text-zinc-500 mt-1">Módulo unificado de cotações para integrar demandas de insumos, embalagens e compras online.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Cotações <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_materia_prima') && (
              <button onClick={() => setView('compras_simulation')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Calculator className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Simulador</h3><p className="text-xs text-zinc-500 mt-1">Simule a produção de lotes de produtos acabados e preveja a demanda consolidada de insumos e embalagens.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Simulador <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_online') && (
              <button onClick={() => setView('compras_online')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Globe className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Compras Online</h3><p className="text-xs text-zinc-500 mt-1">Rastreie e registre pedidos feitos na internet (etiquetas, suprimentos, etc.), controle o status do trânsito e salve comprovantes.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Rastreamento <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_pedidos') && (
              <button onClick={() => setView('compras_pedidos')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><ClipboardList className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Controle de Pedidos</h3><p className="text-xs text-zinc-500 mt-1">Acompanhe e controle os pedidos de compras enviados aos fornecedores e as quantidades já recebidas.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Pedidos <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_notas') && (
              <button onClick={() => setView('compras_notas')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><FileText className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Notas Fiscais</h3><p className="text-xs text-zinc-500 mt-1">Consulte o histórico de Notas Fiscais de compra recebidas e detalhe os itens e valores de cada lançamento.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Notas <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
              {allow('compras_almoxarifado') && (
              <button onClick={() => setView('compras_almoxarifado')} className="group bg-white border border-zinc-200 hover:border-zinc-400 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-56 focus:outline-none w-full cursor-pointer">
                <div className="space-y-4">
                  <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors"><Warehouse className="h-5 w-5" /></div>
                  <div><h3 className="text-lg font-bold text-zinc-900">Almoxarifado</h3><p className="text-xs text-zinc-500 mt-1">Demandas locais de materiais do almox (abaixo do mínimo), marcar pedido e receber gerando entrada.</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">Acessar Almoxarifado <ArrowRight className="h-3 w-3" /></div>
              </button>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer Info */}
      <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
      </footer>
    </div>
  );
}
