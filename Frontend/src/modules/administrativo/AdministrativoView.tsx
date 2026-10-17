import React from 'react';
import { ArrowRight, CheckCircle2, FileSpreadsheet, Layers, Users, Calendar } from 'lucide-react';
import { canAccessView } from '../geral/lib/modules/permissions';
import { getAuthUser } from '../geral/lib/auth';
import { MODULE_KEYS } from '../geral/lib/modules/registry';

interface Props {
  onBackToHub: () => void;
  setView: (view: string) => void;
}

export default function AdministrativoView({ setView }: Props) {
  const user = getAuthUser();
  const allow = (key: string) => canAccessView(user, key);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-zinc-700" />
          <h1 className="text-lg font-bold text-zinc-900">Administrativo</h1>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <p className="text-sm text-zinc-500 mb-8">
          Catálogo mestre, linhas comerciais, equipe e parâmetros que alimentam Produção, Compras e Estoque.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {allow(MODULE_KEYS.ADMIN_LINHA_PRODUTOS) && (
            <button
              type="button"
              onClick={() => setView('admin_linha_produtos')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[220px] w-full"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Linha de Produtos</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Status de ciclo de vida, linhas comerciais, categorias (base, coloração, apoio), kits e overrides.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          )}

          {(allow(MODULE_KEYS.ADMIN_RELATORIOS) || allow(MODULE_KEYS.ADMIN_PRODUTOS_ATIVOS_RELATORIOS)) && (
            <button
              type="button"
              onClick={() => setView('admin_relatorios')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[220px] w-full"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Relatórios</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Central de decisão executiva: Saúde do Estoque (giros, faltas e cobertura) e Relatórios de Produtos Ativos.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          )}

          {allow(MODULE_KEYS.ADMIN_FUNCIONARIOS) && (
            <button
              type="button"
              onClick={() => setView('admin_funcionarios')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[220px] w-full"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Funcionários</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Cadastro RH (CPF, endereço, datas), sessão ativa e atividade recente no sistema.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          )}

          {allow(MODULE_KEYS.ADMIN_ACOMPANHAMENTO_PRODUCAO) && (
            <button
              type="button"
              onClick={() => setView('admin_acompanhamento_producao')}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[220px] w-full cursor-pointer"
            >
              <div className="space-y-4">
                <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Acompanhamento de Produção</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Planilha de lotes e calendário industrial de etapas operacionais (Pesagem, Produção, Envase, Rotulagem e Finalizada).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
                Acessar <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
