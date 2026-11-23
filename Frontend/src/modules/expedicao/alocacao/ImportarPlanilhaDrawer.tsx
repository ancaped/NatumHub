import React, { useEffect, useState } from 'react';
import { Upload, Check, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import Drawer from '../../geral/components/ui/Drawer';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import { importarMapaLote } from './api';
import { parsearPlanilhaMapa, type ParsePlanilhaResultado } from './importarPlanilha';
import type { ImportarMapaLoteResultado } from './types';

interface ImportarPlanilhaDrawerProps {
  open: boolean;
  estruturaId: string;
  estruturaNome: string;
  onClose: () => void;
  onApplied: () => Promise<void>;
  avisar: (msg: string, tipo?: TipoAviso) => void;
}

export function ImportarPlanilhaDrawer({
  open,
  estruturaId,
  estruturaNome,
  onClose,
  onApplied,
  avisar,
}: ImportarPlanilhaDrawerProps) {
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [parsed, setParsed] = useState<ParsePlanilhaResultado | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [previa, setPrevia] = useState<ImportarMapaLoteResultado | null>(null);

  useEffect(() => {
    if (!open) {
      setNomeArquivo('');
      setParsed(null);
      setPrevia(null);
      setSubstituir(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !estruturaId || !parsed || parsed.itens.length === 0) {
      setPrevia(null);
      return;
    }
    let cancelado = false;
    (async () => {
      setSimulando(true);
      try {
        const res = await importarMapaLote(
          {
            estruturaId,
            substituirEstrutura: substituir,
            itens: parsed.itens,
          },
          false,
        );
        if (!cancelado) setPrevia(res);
      } catch (e) {
        if (!cancelado) {
          setPrevia(null);
          avisar(e instanceof Error ? e.message : 'Erro ao simular importação.', 'erro');
        }
      } finally {
        if (!cancelado) setSimulando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, estruturaId, parsed, substituir, avisar]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const res = parsearPlanilhaMapa(wb);
      setParsed(res);
      if (res.itens.length === 0) {
        avisar('Nenhuma posição com códigos de produto encontrada nesta planilha.', 'erro');
      }
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Falha ao ler o arquivo Excel.', 'erro');
      setParsed(null);
    }
  };

  const aplicar = async () => {
    if (!parsed || parsed.itens.length === 0) return;
    setAplicando(true);
    try {
      const res = await importarMapaLote(
        {
          estruturaId,
          substituirEstrutura: substituir,
          itens: parsed.itens,
        },
        true,
      );
      avisar(`Importação concluída: ${res.validos} alocações gravadas em ${estruturaNome}.`, 'sucesso');
      await onApplied();
      onClose();
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'Erro ao importar planilha.', 'erro');
    } finally {
      setAplicando(false);
    }
  };

  if (!open) return null;

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      size="lg"
      title="Importar mapa (.xlsx)"
      subtitle={`Destino: ${estruturaNome || estruturaId} — compatível com Mapas_0309 e planilhas exportadas do Nexus`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-zinc-200 bg-white text-zinc-700 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={simulando || aplicando || !previa || previa.validos === 0}
            onClick={aplicar}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-zinc-900 text-white disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="h-4 w-4" />
            {aplicando ? 'Importando...' : 'Aplicar Importação'}
          </button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-4 text-xs">
        <div className="panel-card !p-4 space-y-3">
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/70 p-5 text-center cursor-pointer hover:border-zinc-500 transition-colors">
            <Upload className="h-6 w-6 text-zinc-500" />
            <span className="font-bold text-zinc-800">
              {nomeArquivo ? nomeArquivo : 'Clique para selecionar um arquivo .xlsx ou .xls'}
            </span>
            <span className="text-[11px] text-zinc-500">
              Aceita o modelo visual (Mapas_0309) ou a planilha exportada do Nexus (Dimensionamento ABC)
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFileChange}
              className="hidden"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-zinc-700">
            <input
              type="checkbox"
              checked={substituir}
              onChange={(e) => setSubstituir(e.target.checked)}
            />
            <span>Substituir todas as alocações atuais desta estante antes de importar</span>
          </label>
        </div>

        {parsed && (
          <div className="panel-card !p-3 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-zinc-900">
              <FileSpreadsheet className="h-4 w-4" />
              Leitura: {parsed.abaUsada ?? '—'} (
              {parsed.formato === 'nexus_dim'
                ? 'Formato Nexus'
                : parsed.formato === 'mapas_0309'
                  ? 'Formato Grade Visual'
                  : 'Não reconhecido'}
              )
            </div>
            <div className="text-zinc-600">
              <strong>{parsed.itens.length}</strong> endereçamentos lidos ·{' '}
              <strong>{parsed.produtosUnicos}</strong> produtos únicos
            </div>
          </div>
        )}

        {simulando && (
          <div className="p-6 text-center text-zinc-500 font-semibold">
            Conferindo posições e produtos no ERP...
          </div>
        )}

        {!simulando && previa && (
          <div className="space-y-3">
            <div className="panel-card !p-3 space-y-1">
              <div className="font-bold text-zinc-900">
                Prévia no servidor: {previa.validos} alocações válidas prontas para gravar
              </div>
              <div className="text-zinc-600 flex flex-wrap gap-3">
                {previa.removidosAtuais > 0 && (
                  <span>Substitui {previa.removidosAtuais} alocações atuais</span>
                )}
                <span>Ignorados por posição inexistente: {previa.ignoradosPosicao}</span>
                <span>Ignorados por produto fora do ERP: {previa.ignoradosProduto}</span>
              </div>
            </div>

            {previa.exemplosIgnorados.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Avisos encontrados na planilha
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
                  {previa.exemplosIgnorados.map((ex, idx) => (
                    <li key={idx}>{ex}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
