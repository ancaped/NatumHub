import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Save, Sparkles, X } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import { usePreviaServidor } from '../../../producao/lib/usePreviaServidor';
import PopFolhasImpressao from './PopFolhasImpressao';
import TrilhaEventos from './formularios/TrilhaEventos';
import type { EventoPop } from './formularios/tipos';
import {
  emptyContent,
  normalizeContent,
  type PopContent,
  type PopDocument,
  type PopSector,
  type PopVersion,
} from '../types';
import type { Formulario } from './FormulariosTab';

interface Props {
  open: boolean;
  document: PopDocument | null;
  sectors: PopSector[];
  logoSrc: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type DrawerTab = 'documento' | 'historico' | 'trilha';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PopDrawer({
  open,
  document: popDoc,
  sectors,
  logoSrc,
  onClose,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>('documento');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [content, setContent] = useState<PopContent>(emptyContent());
  const [elaboratedBy, setElaboratedBy] = useState('');
  const [reviewedBy, setReviewedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [formsDoPop, setFormsDoPop] = useState<Formulario[]>([]);
  const [changeSummary, setChangeSummary] = useState('');
  const [versions, setVersions] = useState<PopVersion[]>([]);
  const [eventos, setEventos] = useState<EventoPop[]>([]);
  const [printVersion, setPrintVersion] = useState<PopVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { pedir, elemento: previaElemento } = usePreviaServidor((mensagem) => setError(mensagem));

  useEffect(() => {
    setMounted(true);
  }, []);

  const isNew = !popDoc;
  const isDraft = popDoc?.status === 'draft';
  const isReview = popDoc?.status === 'in_review';
  const isPublished = popDoc?.status === 'published';

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab('documento');
    setChangeSummary('');
    setPrintVersion(null);
    if (popDoc) {
      setCode(popDoc.code || '');
      setTitle(popDoc.title || '');
      setSectorId(popDoc.sectorId || '');
      setContent(normalizeContent(popDoc.currentVersion?.content));
      setElaboratedBy(popDoc.elaboratedBy ?? '');
      setReviewedBy(popDoc.reviewedBy ?? '');
      setApprovedBy(popDoc.approvedBy ?? '');
      void apiJson<PopVersion[]>(`/qualidade/pops/documents/${popDoc.id}/versions`)
        .then((rows) =>
          setVersions(
            Array.isArray(rows)
              ? rows.map((v) => ({ ...v, content: normalizeContent(v?.content) }))
              : [],
          ),
        )
        .catch(() => setVersions([]));
      void apiJson<EventoPop[]>(`/qualidade/pops/documents/${popDoc.id}/eventos`)
        .then((rows) => setEventos(Array.isArray(rows) ? rows : []))
        .catch(() => setEventos([]));
    } else {
      setCode('');
      setTitle('');
      setSectorId(sectors.find((s) => s.active)?.id ?? sectors[0]?.id ?? '');
      setContent(emptyContent());
      setElaboratedBy('');
      setReviewedBy('');
      setApprovedBy('');
      setVersions([]);
      setEventos([]);
    }
  }, [open, popDoc, sectors]);

  useEffect(() => {
    if (!open || !popDoc?.code) {
      setFormsDoPop([]);
      return;
    }
    const codigo = popDoc.code;
    void apiJson<Formulario[]>('/qualidade/pops/formularios')
      .then((rows) => setFormsDoPop((Array.isArray(rows) ? rows : []).filter((f) => f.popCode === codigo)))
      .catch(() => setFormsDoPop([]));
  }, [open, popDoc?.code]);

  const sectorName = useMemo(
    () => sectors.find((s) => s.id === sectorId)?.name ?? popDoc?.sectorName ?? '',
    [sectors, sectorId, popDoc],
  );

  const revisionLabel = popDoc?.currentRevision ?? 0;
  const effectiveLabel =
    popDoc?.effectiveDate ??
    popDoc?.currentVersion?.effectiveDate ??
    todayIso();

  const payloadContent = (): PopContent => ({
    body: content?.body ?? '',
    elaboratedAt: content?.elaboratedAt || null,
    reviewedAt: content?.reviewedAt || null,
    approvedAt: content?.approvedAt || null,
  });

  const concluir = async () => {
    onSaved();
    onClose();
  };

  const saveDraft = () => {
    const corpo = {
      title,
      sectorId,
      content: payloadContent(),
      elaboratedBy: elaboratedBy || undefined,
      reviewedBy: reviewedBy || undefined,
      approvedBy: approvedBy || undefined,
    };
    setError(null);
    if (isNew) {
      void pedir({
        url: '/qualidade/pops/documents',
        init: { method: 'POST', body: JSON.stringify({ code, ...corpo }) },
        titulo: 'Criar POP',
        confirmarRotulo: 'Criar rascunho',
        linhas: (d) => [{ titulo: String(d?.code ?? code), detalhe: `${title} · rascunho` }],
        erroPadrao: 'Falha ao salvar rascunho',
        aoConcluir: concluir,
      });
      return;
    }
    void pedir({
      url: `/qualidade/pops/documents/${popDoc.id}`,
      init: { method: 'PUT', body: JSON.stringify(corpo) },
      titulo: 'Salvar POP',
      confirmarRotulo: 'Salvar',
      linhas: (d) => [{ titulo: String(d?.code ?? popDoc.code), detalhe: `${title} · ${(content?.body ?? '').length} caracteres no corpo` }],
      erroPadrao: 'Falha ao salvar rascunho',
      aoConcluir: concluir,
    });
  };

  const exigirMotivo = () => {
    if (!changeSummary.trim()) {
      setError('Informe o motivo.');
      return false;
    }
    return true;
  };

  const ROTULO: Record<string, string> = { in_review: 'Em aprovação', draft: 'Rascunho', obsolete: 'Obsoleto' };

  const mover = (status: string) => {
    if (!popDoc || !exigirMotivo()) return;
    setError(null);
    void pedir({
      url: `/qualidade/pops/documents/${popDoc.id}/status`,
      init: { method: 'POST', body: JSON.stringify({ status, motivo: changeSummary.trim() }) },
      titulo: status === 'in_review' ? 'Enviar para aprovação' : status === 'draft' ? 'Devolver ao rascunho' : 'Tornar obsoleto',
      confirmarRotulo: 'Confirmar',
      linhas: () => [{ titulo: popDoc.code, detalhe: `${ROTULO[popDoc.status] ?? popDoc.status} → ${ROTULO[status] ?? status} · ${changeSummary.trim()}` }],
      erroPadrao: 'Falha ao mudar o status',
      aoConcluir: concluir,
    });
  };

  const publish = () => {
    if (!popDoc || !exigirMotivo()) return;
    setError(null);
    void pedir({
      url: `/qualidade/pops/documents/${popDoc.id}/publish`,
      init: {
        method: 'POST',
        body: JSON.stringify({
          content: payloadContent(),
          changeSummary: changeSummary || undefined,
          elaboratedBy: elaboratedBy || undefined,
          reviewedBy: reviewedBy || undefined,
          approvedBy: approvedBy || undefined,
        }),
      },
      titulo: isReview ? 'Aprovar POP' : 'Publicar revisão',
      confirmarRotulo: isReview ? 'Aprovar' : 'Publicar',
      linhas: (d) => [{
        titulo: `${popDoc.code} · Rev. ${String(d?.currentRevision ?? popDoc.currentRevision + 1).padStart(2, '0')}`,
        detalhe: `Vigência ${fmtDate(d?.effectiveDate)} · próxima revisão ${fmtDate(d?.nextReviewDate)} · ${changeSummary.trim()}`,
      }],
      erroPadrao: 'Falha ao publicar versão',
      aoConcluir: concluir,
    });
  };

  const revalidate = () => {
    if (!popDoc || !exigirMotivo()) return;
    setError(null);
    void pedir({
      url: `/qualidade/pops/documents/${popDoc.id}/revalidate`,
      init: { method: 'POST', body: JSON.stringify({ changeSummary: changeSummary || undefined }) },
      titulo: 'Revalidar POP',
      confirmarRotulo: 'Revalidar',
      linhas: (d) => [{
        titulo: `${popDoc.code} · Rev. ${String(d?.currentRevision ?? popDoc.currentRevision + 1).padStart(2, '0')}`,
        detalhe: `Vigência ${fmtDate(d?.effectiveDate)} · próxima revisão ${fmtDate(d?.nextReviewDate)} · ${changeSummary.trim()}`,
      }],
      erroPadrao: 'Falha ao revalidar POP',
      aoConcluir: concluir,
    });
  };

  const openPrint = (version?: PopVersion | null) => {
    const v =
      version ??
      ({
        revision: popDoc?.currentRevision ?? 0,
        effectiveDate: popDoc?.effectiveDate ?? todayIso(),
        content: payloadContent(),
        elaboratedBy,
        reviewedBy,
        approvedBy,
      } as PopVersion);
    setPrintVersion({
      ...v,
      content: normalizeContent(v.content),
    });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const portalTarget =
    mounted && typeof window !== 'undefined' && window.document
      ? window.document.body
      : null;

  if (!open && !printVersion) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      )}
      {open && (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-zinc-100 shadow-xl flex flex-col border-l border-zinc-200">
          <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-200 bg-white">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-zinc-500">POP</p>
              <p className="font-semibold text-zinc-900 truncate">
                {isNew ? 'Novo procedimento' : popDoc?.code}
              </p>
              {!isNew && <p className="text-sm text-zinc-600 truncate">{popDoc?.title}</p>}
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100">
              <X className="w-5 h-5" />
            </button>
          </header>

          {!isNew && (
            <div className="flex gap-1 px-4 pt-3 bg-white">
              {(
                [
                  ['documento', 'Documento'],
                  ['historico', 'Histórico'],
                  ['trilha', 'Trilha'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    tab === id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {tab === 'documento' && (
              <>
                {isNew && (
                  <div className="grid grid-cols-2 gap-3 bg-white rounded-xl border border-zinc-200 p-3">
                    <label className="block text-sm">
                      <span className="text-zinc-600">Código</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="POP-PRD-030"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-zinc-600">Setor</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                        value={sectorId}
                        onChange={(e) => setSectorId(e.target.value)}
                      >
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {/* Página A4 — 3 barras */}
                <div className="bg-white border border-zinc-300 shadow-sm mx-auto w-full max-w-[210mm]">
                  {/* Barra 1 — título */}
                  <table className="w-full border-collapse text-[11px]">
                    <tbody>
                      <tr>
                        <td className="w-[22%] border border-zinc-800 p-2 text-center align-middle">
                          {logoSrc ? (
                            <img src={logoSrc} alt="Logo" className="max-h-14 max-w-full mx-auto object-contain" />
                          ) : (
                            <span className="text-zinc-400">LOGO</span>
                          )}
                        </td>
                        <td className="border border-zinc-800 p-2 text-center align-middle">
                          <div className="font-bold text-sm">Procedimento Operacional Padrão</div>
                          <input
                            className="mt-1 w-full text-center text-sm border-0 border-b border-dashed border-zinc-300 focus:outline-none focus:border-zinc-500 bg-transparent"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Título do POP"
                          />
                        </td>
                        <td className="w-[28%] border border-zinc-800 p-2 align-top space-y-0.5">
                          <div>
                            <strong>Código:</strong> {code || '—'}
                          </div>
                          <div>
                            <strong>Revisão:</strong> {String(revisionLabel).padStart(2, '0')}
                          </div>
                          <div>
                            <strong>Data:</strong> {fmtDate(effectiveLabel)}
                          </div>
                          <div>
                            <strong>Setor:</strong> {sectorName || '—'}
                          </div>
                          {!isNew && (
                            <label className="block pt-1">
                              <span className="text-zinc-500">Setor</span>
                              <select
                                className="mt-0.5 w-full border border-zinc-200 rounded px-1 py-0.5"
                                value={sectorId}
                                onChange={(e) => setSectorId(e.target.value)}
                              >
                                {sectors.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Barra 2 — corpo contínuo */}
                  <div className="border-x border-b border-zinc-800 p-3 min-h-[420px] relative group">
                    <div className="flex items-center justify-between mb-1 text-[11px] text-zinc-500">
                      <span>Corpo do Procedimento</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!content?.body) return;
                          let s = content.body;
                          s = s.replace(/Elaborado\s+por\s*[:.]?[\s\S]*?(?:Aprovado\s+por\s*[:.]?|DATA\s*[:.]?\s*\d{2}\/\d{2}\/\d{4})[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');
                          s = s.replace(/Elaborado\s+por\s*[:.]?[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');
                          s = s.replace(/Revisado\s+por\s*[:.]?[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');
                          s = s.replace(/Aprovado\s+por\s*[:.]?[\s\S]*?(?=\n\s*(?:\d+\.\s*)?[A-ZÁÉÍÓÚÇ]{3,}|$)/gi, '\n');
                          s = s.replace(/Procedimento\s+Operacional\s+Padr[ãa]o[\s\S]*?(?:P[ÁA]GINA\s*[:.]?\s*\d+\s+de\s+\d+|CÓDIC?O\s*[:.]?\s*POP-[A-Z0-9-]+)/gi, '\n');
                          s = s.replace(/(?:P[ÁA]GINA|PAGINA)\s*[:.]?\s*\n*\s*\d+\s+de\s+\d+/gi, '');
                          s = s.replace(/CÓDIC?O\s*[:.]?\s*\n*\s*POP-[A-Z0-9-]+/gi, '');
                          s = s.replace(/REVIS[ÃA]O\s*[:.]?\s*\n*\s*\d+/gi, '');
                          s = s.replace(/^[\s_.-]+$/gm, '');
                          s = s.replace(/^DATA\s*[:.]?\s*\n*\s*\d{2}\/\d{2}\/\d{4}$/gmi, '');
                          s = s.split('\n').map(l => l.trim()).filter((l, idx, arr) => {
                            if (/^DATA\s*[:.]?/i.test(l) && idx > arr.length - 5) return false;
                            if (/^Elaborado|^Revisado|^Aprovado/i.test(l)) return false;
                            return true;
                          }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
                          setContent((c) => ({ ...(c ?? emptyContent()), body: s }));
                        }}
                        className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-sans text-[10px] flex items-center gap-1"
                        title="Remove assinaturas e cabeçalhos colados no meio do texto"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        Sanitizar Texto
                      </button>
                    </div>
                    <textarea
                      className="w-full min-h-[400px] resize-y border-0 focus:outline-none text-[12px] leading-relaxed font-serif bg-transparent"
                      value={content?.body ?? ''}
                      onChange={(e) => setContent((c) => ({ ...(c ?? emptyContent()), body: e.target.value }))}
                      placeholder="Corpo do procedimento (Objetivo, condições, responsabilidades, atividades…)"
                    />
                    {isPublished && (
                      <p className="text-[10px] text-amber-700 mt-1">
                        POP publicado: edite o corpo e use «Publicar revisão» para gravar no histórico.
                      </p>
                    )}
                  </div>

                  <table className="w-full border-collapse text-[11px]">
                    <tbody>
                      <tr>
                        {['Elaborado:', 'Revisado:', 'Aprovado:'].map((rotulo) => (
                          <td key={rotulo} className="w-1/3 border border-zinc-800 p-2 align-top">
                            <div className="font-semibold mb-6">{rotulo}</div>
                            <div className="border-b border-zinc-800 mb-3" />
                            <div className="text-zinc-500">Data: ____/____/________</div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[10px] text-zinc-500">Assinaturas à caneta, na folha impressa.</p>
                  {formsDoPop.length > 0 && (
                    <div className="text-[11px] text-zinc-600">
                      <p className="font-semibold text-zinc-800 mb-1">Formulários deste POP</p>
                      <ul className="space-y-0.5">
                        {formsDoPop.map((f) => (
                          <li key={f.code} className="font-mono">{f.code} · {f.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {!isNew && (
                  <label className="block text-sm bg-white rounded-xl border border-zinc-200 p-3">
                    <span className="text-zinc-600">Motivo (obrigatório para enviar, aprovar, revalidar ou tornar obsoleto)</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      placeholder="Ex.: Revalidação anual / Ajuste no procedimento"
                    />
                  </label>
                )}
              </>
            )}

            {tab === 'historico' && (
              <div className="space-y-2">
                {versions.length === 0 && (
                  <p className="text-sm text-zinc-500">Nenhuma versão registrada.</p>
                )}
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        Rev. {v.revision} · {v.changeKind}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Vigência {fmtDate(v.effectiveDate)} · próxima {fmtDate(v.nextReviewDate)}
                      </p>
                      {v.changeSummary && (
                        <p className="text-xs text-zinc-600 mt-0.5">{v.changeSummary}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg border border-zinc-300 hover:bg-zinc-50"
                      onClick={() => openPrint(v)}
                    >
                      Imprimir
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'trilha' && <TrilhaEventos eventos={eventos} />}
          </div>

          <footer className="border-t border-zinc-200 px-4 py-3 flex flex-wrap gap-2 justify-end bg-white">
            {!isNew && (
              <button
                type="button"
                onClick={() => openPrint(null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm hover:bg-zinc-50 transition-colors"
              >
                <Printer className="w-4 h-4 text-zinc-700" />
                Imprimir PDF
              </button>
            )}
            <button
              type="button"
              disabled={!title.trim() || (isNew && !code.trim())}
              onClick={saveDraft}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>
            {isDraft && (
              <button
                type="button"
                onClick={() => mover('in_review')}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                Enviar para aprovação
              </button>
            )}
            {isReview && (
              <>
                <button
                  type="button"
                  onClick={() => mover('draft')}
                  className="px-3 py-2 rounded-lg border border-zinc-300 text-sm hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  Devolver ao rascunho
                </button>
                <button
                  type="button"
                  onClick={publish}
                  className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Aprovar
                </button>
              </>
            )}
            {isPublished && (
              <button
                type="button"
                onClick={publish}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                Publicar revisão
              </button>
            )}
            {(isPublished || isReview) && (
              <button
                type="button"
                onClick={() => mover('obsolete')}
                className="px-3 py-2 rounded-lg border border-zinc-300 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                Tornar obsoleto
              </button>
            )}
            {isPublished && (
              <button
                type="button"
                onClick={revalidate}
                className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                Revalidar
              </button>
            )}
          </footer>
        </aside>
      )}
      {previaElemento}

      {portalTarget && printVersion &&
        createPortal(
          <PopFolhasImpressao
            dados={{
              logoSrc,
              titulo: title || popDoc?.title || '',
              codigo: code || popDoc?.code || '',
              revisao: String(printVersion.revision).padStart(2, '0'),
              data: fmtDate(printVersion.effectiveDate),
              setor: sectorName,
              corpo: printVersion.content?.body || '—',
              elaboradoPor: '',
              elaboradoEm: '',
              revisadoPor: '',
              revisadoEm: '',
              aprovadoPor: '',
              aprovadoEm: '',
            }}
          />,
          portalTarget,
        )}
    </>
  );
}
