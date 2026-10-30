import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { apiJson } from '../../../../geral/lib/http';
import { usePreviaServidor } from '../../../../producao/lib/usePreviaServidor';
import type { TipoAviso } from '../../../../geral/components/ui/Aviso';
import type { PopDocument } from '../../types';
import { Folha, type ImpressaoDados } from './FormularioFolhas';
import FormularioEditor, { type OpcaoPop } from './FormularioEditor';
import TrilhaEventos from './TrilhaEventos';
import { aplicarEditor, editorMudou, estadoDoFormulario, payloadDoEditor, type EstadoEditor } from './editor';
import {
  deitado,
  fmtData,
  fmtDataHora,
  linhasPorFolha,
  montarFolhas,
  paraImpressao,
  paraImpressaoRascunho,
  paraImpressaoRevisao,
  rev2,
  rotuloStatus,
  type ParaImprimir,
} from './montagem';
import type { FormularioDetalhe } from './tipos';

interface Props {
  code: string | null;
  logoSrc?: string | null;
  onClose: () => void;
  /** Avisa a lista que algo mudou (recarregar). */
  onMudou: () => void;
  onImprimir: (d: ImpressaoDados) => void;
  avisar: (mensagem: string, tipo?: TipoAviso) => void;
}

type Aba = 'folha' | 'editar' | 'historico' | 'trilha';

const botao = 'px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer disabled:opacity-50';
const botaoPrimario = `${botao} bg-zinc-900 text-white border-zinc-900`;
const botaoNeutro = `${botao} bg-white text-zinc-700 border-zinc-200`;

export default function FormularioDrawer({ code, logoSrc, onClose, onMudou, onImprimir, avisar }: Props) {
  const [det, setDet] = useState<FormularioDetalhe | null>(null);
  const [aba, setAba] = useState<Aba>('folha');
  const [folha, setFolha] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [editor, setEditor] = useState<EstadoEditor | null>(null);
  const [pops, setPops] = useState<OpcaoPop[]>([]);
  const { pedir, elemento: previaElemento } = usePreviaServidor(avisar);

  const url = code ? `/qualidade/pops/formularios/${encodeURIComponent(code)}` : '';

  const carregar = useCallback(async () => {
    if (!code) return;
    try {
      const d = await apiJson<FormularioDetalhe>(`/qualidade/pops/formularios/${encodeURIComponent(code)}`);
      setDet({ ...d, revisoes: d.revisoes ?? [], eventos: d.eventos ?? [] });
      setEditor(estadoDoFormulario(d));
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Falha ao carregar o formulário', 'erro');
    }
  }, [code, avisar]);

  useEffect(() => {
    setDet(null);
    setAba('folha');
    setFolha(0);
    setMotivo('');
    if (code) void carregar();
  }, [code, carregar]);

  useEffect(() => {
    if (!code) return;
    void apiJson<PopDocument[]>('/qualidade/pops/documents')
      .then((rows) => setPops((Array.isArray(rows) ? rows : []).map((d) => ({ code: d.code, title: d.title }))))
      .catch(() => setPops([]));
  }, [code]);

  const rascunho = det?.status === 'draft';
  const emAprovacao = det?.status === 'in_review';
  const vigente = det?.status === 'published';

  const aoConcluir = async () => {
    setMotivo('');
    await carregar();
    onMudou();
  };

  const exigirMotivo = () => {
    if (!motivo.trim()) {
      avisar('Informe o motivo.', 'erro');
      return false;
    }
    return true;
  };

  const mover = (destino: 'in_review' | 'draft' | 'obsolete', titulo: string, rotulo: string) => {
    if (!det || !exigirMotivo()) return;
    void pedir({
      url: `${url}/status`,
      init: { method: 'POST', body: JSON.stringify({ destino, motivo: motivo.trim() }) },
      titulo,
      confirmarRotulo: rotulo,
      linhas: () => [{
        titulo: det.code,
        detalhe: `${rotuloStatus(det.status).texto} → ${rotuloStatus(destino).texto} · ${motivo.trim()}`,
      }],
      erroPadrao: 'Não foi possível mudar o status.',
      aoConcluir,
    });
  };

  const publicar = () => {
    if (!det || !exigirMotivo()) return;
    void pedir({
      url: `${url}/publicar`,
      init: { method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }) },
      titulo: 'Aprovar e publicar formulário',
      confirmarRotulo: 'Aprovar e publicar',
      linhas: (d) => [
        { titulo: `${det.code} · Rev. ${rev2(d?.revision)}`, detalhe: `Vigência ${fmtData(d?.effectiveDate)} · próxima revisão ${fmtData(d?.nextReviewDate)}` },
        { titulo: 'Aprovado por', detalhe: String(d?.approvedBy ?? '') },
      ],
      avisos: () => (det.jaPublicado ? [`A Rev. ${rev2(det.revision)} passa a «substituída» e fica no histórico.`] : []),
      erroPadrao: 'Não foi possível publicar.',
      aoConcluir,
    });
  };

  const novaRevisao = () => {
    if (!det || !exigirMotivo()) return;
    void pedir({
      url: `${url}/revisao`,
      init: { method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }) },
      titulo: 'Abrir nova revisão',
      confirmarRotulo: 'Abrir nova revisão',
      linhas: (d) => [{ titulo: det.code, detalhe: `Rascunho da Rev. ${rev2(d?.nextRevision)} · ${motivo.trim()}` }],
      avisos: () => [`A Rev. ${rev2(det.revision)} continua valendo e sendo impressa até a nova ser aprovada.`],
      erroPadrao: 'Não foi possível abrir a nova revisão.',
      aoConcluir,
    });
  };

  const salvar = () => {
    if (!det || !editor) return;
    void pedir({
      url,
      init: { method: 'PUT', body: JSON.stringify(payloadDoEditor(editor)) },
      titulo: 'Salvar rascunho do formulário',
      confirmarRotulo: 'Salvar',
      linhas: (d) => [{
        titulo: det.code,
        detalhe: `${d?.fields?.length ?? 0} colunas · ${montarFolhas(d?.areas).length} folha(s) · ${linhasPorFolha(d ?? det)} linhas por folha · ${d?.orientation === 'landscape' ? 'horizontal' : 'vertical'}`,
      }],
      erroPadrao: 'Não foi possível salvar.',
      aoConcluir,
    });
  };

  const imprimir = (p: ParaImprimir | null) => {
    if (!p) {
      avisar('Esta revisão é anterior ao controle de documentos e não tem a cópia da folha.', 'erro');
      return;
    }
    onImprimir({ ...p, logoSrc });
  };

  // Folha da prévia: no editor mostra o que está sendo digitado; nas demais abas, o que a impressão oficial imprime.
  const previa = useMemo(() => {
    if (!det) return null;
    if (aba === 'editar' && editor) return { form: aplicarEditor(det, editor), marca: 'rascunho' as const };
    return paraImpressao(det);
  }, [det, aba, editor]);

  const folhas = previa ? montarFolhas(previa.form.areas) : [null];
  const idxFolha = Math.min(folha, folhas.length - 1);
  const escala = previa && deitado(previa.form) ? 0.42 : 0.48;
  const st = det ? rotuloStatus(det.status) : null;

  const abas = [
    { id: 'folha', label: 'Folha' },
    { id: 'editar', label: 'Editar', show: !!rascunho },
    { id: 'historico', label: 'Histórico', badge: det?.revisoes.length || undefined },
    { id: 'trilha', label: 'Trilha', badge: det?.eventos.length || undefined },
  ];

  return (
    <>
      <Drawer
        isOpen={!!code}
        onClose={onClose}
        title={code ?? ''}
        subtitle={det?.title}
        size="xl"
        loading={!det}
        tabs={abas}
        activeTab={aba}
        onTabChange={(id) => setAba(id as Aba)}
        badge={st ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.classe}`}>{st.texto}</span> : undefined}
        headerActions={det ? (
          <div className="flex gap-1.5">
            {det.emRevisao && (
              <button type="button" onClick={() => imprimir(paraImpressaoRascunho(det))} className={botaoNeutro}>
                Imprimir rascunho
              </button>
            )}
            <button type="button" onClick={() => imprimir(paraImpressao(det))} className={`${botaoPrimario} inline-flex items-center gap-1.5`}>
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
          </div>
        ) : null}
        footer={det && det.status !== 'obsolete' ? (
          <div className="flex flex-col gap-2">
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={vigente ? 'Motivo (obrigatório para abrir nova revisão ou tornar obsoleto)' : 'Motivo (obrigatório para enviar, devolver, aprovar ou tornar obsoleto)'}
            />
            <div className="flex flex-wrap justify-end gap-2">
              {rascunho && (
                <>
                  <button type="button" disabled={!editor || !editorMudou(det, editor)} onClick={salvar} className={botaoNeutro}>Salvar rascunho</button>
                  <button type="button" disabled={!!editor && editorMudou(det, editor)} title={editor && editorMudou(det, editor) ? 'Salve as alterações antes de enviar.' : undefined} onClick={() => mover('in_review', 'Enviar para aprovação', 'Enviar para aprovação')} className={botaoPrimario}>
                    Enviar para aprovação
                  </button>
                </>
              )}
              {emAprovacao && (
                <>
                  <button type="button" onClick={() => mover('draft', 'Devolver ao rascunho', 'Devolver')} className={botaoNeutro}>Devolver ao rascunho</button>
                  <button type="button" onClick={publicar} className={botaoPrimario}>Aprovar e publicar</button>
                </>
              )}
              {vigente && (
                <button type="button" onClick={novaRevisao} className={botaoPrimario}>Nova revisão</button>
              )}
              {(vigente || emAprovacao) && (
                <button type="button" onClick={() => mover('obsolete', 'Tornar obsoleto', 'Tornar obsoleto')} className={botaoNeutro}>Tornar obsoleto</button>
              )}
            </div>
          </div>
        ) : undefined}
      >
        {det && previa && (
          <div className="space-y-4 text-sm">
            {aba === 'folha' && (
              <>
                <div className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <p><span className="text-zinc-500">POP </span><span className="font-mono">{det.popCode}</span>{det.popTitle ? ` — ${det.popTitle}` : ''}</p>
                  <p><span className="text-zinc-500">Antes </span>{det.previousCode || '—'} · {det.periodicity}</p>
                  <p><span className="text-zinc-500">Revisão </span>{rev2(det.revision)}{det.emRevisao ? ` (em edição: Rev. ${rev2(det.nextRevision)})` : ''}</p>
                  <p><span className="text-zinc-500">Vigência </span>{fmtData(det.effectiveDate) || '—'} · <span className="text-zinc-500">próxima revisão </span>{fmtData(det.nextReviewDate) || '—'}</p>
                  <p><span className="text-zinc-500">Elaborado por </span>{det.elaboratedBy || '—'}</p>
                  <p><span className="text-zinc-500">Aprovado por </span>{det.approvedBy || '—'}{det.approvedAt ? ` em ${fmtDataHora(det.approvedAt)}` : ''}</p>
                </div>
                {det.note && <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3">{det.note}</p>}
                {det.emRevisao && (
                  <p className="rounded-xl bg-sky-50 border border-sky-200 text-sky-900 p-3 text-xs">
                    Nova revisão em {det.status === 'draft' ? 'rascunho' : 'aprovação'}. A impressão oficial continua sendo a Rev. {rev2(det.revision)} até a nova ser aprovada.
                  </p>
                )}
              </>
            )}

            {(aba === 'folha' || aba === 'editar') && (
              <div>
                {folhas.length > 1 && (
                  <label className="block text-xs text-zinc-500 mb-2">
                    Prévia da área
                    <select className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900" value={idxFolha} onChange={(e) => setFolha(Number(e.target.value))}>
                      {folhas.map((a, i) => <option key={`${a}-${i}`} value={i}>{a}</option>)}
                    </select>
                  </label>
                )}
                <div className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 overflow-auto">
                  <div style={{ width: `calc(${deitado(previa.form) ? 297 : 210}mm * ${escala})`, height: `calc(${deitado(previa.form) ? 209 : 296}mm * ${escala})`, overflow: 'hidden', margin: '0 auto' }}>
                    <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left' }}>
                      <Folha f={previa.form} area={folhas[idxFolha]} pagina={idxFolha + 1} total={folhas.length} logoSrc={logoSrc} marca={previa.marca} />
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 text-center mt-2">
                    {deitado(previa.form) ? 'Folha horizontal (A4 deitado).' : 'Folha vertical (A4).'}
                    {folhas.length > 1 ? ` ${folhas.length} folhas, uma por área.` : ''}
                    {previa.marca ? ' Marca de água só no papel/PDF não válido.' : ''}
                  </p>
                </div>
              </div>
            )}

            {aba === 'editar' && editor && rascunho && (
              <FormularioEditor valor={editor} onChange={setEditor} pops={pops} />
            )}

            {aba === 'historico' && (
              <div className="space-y-2">
                {det.revisoes.length === 0 && <p className="text-zinc-500">Ainda não foi publicado: nenhuma revisão no histórico.</p>}
                {det.revisoes.map((r) => (
                  <div key={r.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">
                        Rev. {rev2(r.revision)} · {r.title}
                        {r.snapshot?.effectiveDate ? <span className="text-zinc-500 font-normal"> · vigência {fmtData(r.snapshot.effectiveDate)}</span> : null}
                      </p>
                      <p className="text-xs text-zinc-600">{r.motivo}</p>
                      <p className="text-[11px] text-zinc-400">{r.createdBy || '—'} · {fmtDataHora(r.createdAt)}{r.snapshot ? ` · ${r.snapshot.fields.length} colunas` : ' · sem cópia da folha'}</p>
                    </div>
                    <button type="button" disabled={!r.temCopia} onClick={() => imprimir(paraImpressaoRevisao(det, r))} className={botaoNeutro}>
                      Imprimir
                    </button>
                  </div>
                ))}
              </div>
            )}

            {aba === 'trilha' && <TrilhaEventos eventos={det.eventos} />}
          </div>
        )}
      </Drawer>
      {previaElemento}
    </>
  );
}
