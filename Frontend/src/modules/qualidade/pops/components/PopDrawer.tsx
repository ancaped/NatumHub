import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer, Save, Sparkles, X } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import {
  emptyContent,
  normalizeContent,
  type PopContent,
  type PopDocument,
  type PopSector,
  type PopVersion,
} from '../types';

interface Props {
  open: boolean;
  document: PopDocument | null;
  sectors: PopSector[];
  logoSrc: string | null;
  onClose: () => void;
  onSaved: () => void;
}

type DrawerTab = 'documento' | 'historico';

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
  const [changeSummary, setChangeSummary] = useState('');
  const [versions, setVersions] = useState<PopVersion[]>([]);
  const [printVersion, setPrintVersion] = useState<PopVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isNew = !popDoc;
  const isDraft = popDoc?.status === 'draft';
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
    } else {
      setCode('');
      setTitle('');
      setSectorId(sectors.find((s) => s.active)?.id ?? sectors[0]?.id ?? '');
      setContent(emptyContent());
      setElaboratedBy('Responsável Técnico');
      setReviewedBy('Equipe de Controle de Qualidade');
      setApprovedBy('');
      setVersions([]);
    }
  }, [open, popDoc, sectors]);

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

  const saveDraft = async () => {
    try {
      setBusy(true);
      setError(null);
      if (isNew) {
        await apiJson('/qualidade/pops/documents', {
          method: 'POST',
          body: JSON.stringify({
            code,
            title,
            sectorId,
            content: payloadContent(),
            elaboratedBy: elaboratedBy || undefined,
            reviewedBy: reviewedBy || undefined,
            approvedBy: approvedBy || undefined,
          }),
        });
      } else {
        await apiJson(`/qualidade/pops/documents/${popDoc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title,
            sectorId,
            content: payloadContent(),
            elaboratedBy: elaboratedBy || undefined,
            reviewedBy: reviewedBy || undefined,
            approvedBy: approvedBy || undefined,
          }),
        });
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar rascunho');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!popDoc) return;
    try {
      setBusy(true);
      setError(null);
      await apiJson(`/qualidade/pops/documents/${popDoc.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          content: payloadContent(),
          changeSummary: changeSummary || undefined,
          elaboratedBy: elaboratedBy || undefined,
          reviewedBy: reviewedBy || undefined,
          approvedBy: approvedBy || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao publicar versão');
    } finally {
      setBusy(false);
    }
  };

  const revalidate = async () => {
    if (!popDoc) return;
    try {
      setBusy(true);
      setError(null);
      await apiJson(`/qualidade/pops/documents/${popDoc.id}/revalidate`, {
        method: 'POST',
        body: JSON.stringify({
          changeSummary: changeSummary || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao revalidar POP');
    } finally {
      setBusy(false);
    }
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

                  {/* Barra 3 — rodapé assinaturas */}
                  <table className="w-full border-collapse text-[11px]">
                    <tbody>
                      <tr>
                        <td className="w-1/3 border border-zinc-800 p-2 align-top">
                          <div className="font-semibold mb-1">Elaborado:</div>
                          <input
                            className="w-full border-0 border-b border-zinc-200 focus:outline-none bg-transparent"
                            value={elaboratedBy}
                            onChange={(e) => setElaboratedBy(e.target.value)}
                          />
                          <div className="mt-2 text-zinc-500">Data:</div>
                          <input
                            type="date"
                            className="w-full border border-zinc-200 rounded px-1 py-0.5"
                            value={content?.elaboratedAt?.slice(0, 10) || ''}
                            onChange={(e) =>
                              setContent((c) => ({ ...(c ?? emptyContent()), elaboratedAt: e.target.value || null }))
                            }
                          />
                        </td>
                        <td className="w-1/3 border border-zinc-800 p-2 align-top">
                          <div className="font-semibold mb-1">Revisado:</div>
                          <input
                            className="w-full border-0 border-b border-zinc-200 focus:outline-none bg-transparent"
                            value={reviewedBy}
                            onChange={(e) => setReviewedBy(e.target.value)}
                          />
                          <div className="mt-2 text-zinc-500">Data:</div>
                          <input
                            type="date"
                            className="w-full border border-zinc-200 rounded px-1 py-0.5"
                            value={content?.reviewedAt?.slice(0, 10) || ''}
                            onChange={(e) =>
                              setContent((c) => ({ ...(c ?? emptyContent()), reviewedAt: e.target.value || null }))
                            }
                          />
                        </td>
                        <td className="border border-zinc-800 p-2 align-top">
                          <div className="font-semibold mb-1">Aprovado:</div>
                          <input
                            className="w-full border-0 border-b border-zinc-200 focus:outline-none bg-transparent"
                            value={approvedBy}
                            onChange={(e) => setApprovedBy(e.target.value)}
                          />
                          <div className="mt-2 text-zinc-500">Data:</div>
                          <input
                            type="date"
                            className="w-full border border-zinc-200 rounded px-1 py-0.5"
                            value={content?.approvedAt?.slice(0, 10) || ''}
                            onChange={(e) =>
                              setContent((c) => ({ ...(c ?? emptyContent()), approvedAt: e.target.value || null }))
                            }
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {!isNew && (
                  <label className="block text-sm bg-white rounded-xl border border-zinc-200 p-3">
                    <span className="text-zinc-600">Resumo da mudança (publicar / revalidar)</span>
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
              disabled={busy || !title.trim() || (isNew && !code.trim())}
              onClick={() => void saveDraft()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
            {!isNew && (isDraft || isPublished) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void publish()}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {isDraft ? 'Publicar' : 'Publicar revisão'}
              </button>
            )}
            {isPublished && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void revalidate()}
                className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                Revalidar
              </button>
            )}
          </footer>
        </aside>
      )}

      {portalTarget && printVersion &&
        createPortal(
          <div className="pop-print-root">
            <style>{`
              @media screen {
                .pop-print-root { display: none !important; }
              }
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 10mm 12mm 12mm 12mm;
                }
                html, body {
                  background: #fff !important;
                  color: #000 !important;
                  font-family: "Times New Roman", Times, Georgia, serif !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  overflow: visible !important;
                }
                body > *:not(.pop-print-root) {
                  display: none !important;
                }
                .pop-print-root {
                  display: block !important;
                  position: relative !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #fff !important;
                  color: #000 !important;
                }
                .pop-print-table {
                  width: 100% !important;
                  border-collapse: collapse !important;
                  border: 1px solid #000 !important;
                  table-layout: fixed !important;
                }
                .pop-print-header {
                  display: table-header-group !important;
                }
                .pop-print-footer {
                  display: table-footer-group !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
                .pop-print-body {
                  display: table-row-group !important;
                }
              }
            `}</style>
            <table className="pop-print-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
              <thead className="pop-print-header">
                <tr>
                  <td style={{ padding: 0, border: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                      <tbody>
                        <tr>
                          <td style={{ width: '22%', border: '1px solid #000', padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                            {logoSrc ? (
                              <img src={logoSrc} alt="Logo" style={{ maxHeight: 52, maxWidth: '100%', objectFit: 'contain', margin: '0 auto' }} />
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 'bold' }}>NÁTUM BIO</span>
                            )}
                          </td>
                          <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>Procedimento Operacional Padrão</div>
                            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>{title || document?.title}</div>
                          </td>
                          <td style={{ width: '28%', border: '1px solid #000', padding: 6, fontSize: 10, verticalAlign: 'top', lineHeight: 1.3 }}>
                            <div><strong>Código:</strong> {code || document?.code}</div>
                            <div><strong>Revisão:</strong> {String(printVersion.revision).padStart(2, '0')}</div>
                            <div><strong>Data:</strong> {fmtDate(printVersion.effectiveDate)}</div>
                            <div><strong>Setor:</strong> {sectorName}</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </thead>
              <tbody className="pop-print-body">
                <tr>
                  <td style={{ padding: 0, border: '0' }}>
                    <div
                      style={{
                        borderLeft: '1px solid #000',
                        borderRight: '1px solid #000',
                        padding: '14px 16px',
                        fontSize: 11,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        minHeight: 420,
                        fontFamily: 'Georgia, "Times New Roman", Times, serif',
                      }}
                    >
                      {printVersion.content?.body || '—'}
                    </div>
                  </td>
                </tr>
              </tbody>
              <tfoot className="pop-print-footer">
                <tr>
                  <td style={{ padding: 0, border: '0' }}>
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        border: '1px solid #000',
                        fontSize: 10,
                        pageBreakInside: 'avoid',
                        breakInside: 'avoid',
                      }}
                    >
                      <tbody>
                        <tr>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', width: '33%', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Elaborado:</div>
                            <div>{printVersion.elaboratedBy || elaboratedBy || 'Responsável Técnico'}</div>
                            <div style={{ marginTop: 6, fontSize: 9, color: '#333' }}>
                              Data: {fmtDate(printVersion.content?.elaboratedAt || content?.elaboratedAt)}
                            </div>
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', width: '33%', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Revisado:</div>
                            <div>{printVersion.reviewedBy || reviewedBy || 'Equipe de Controle de Qualidade'}</div>
                            <div style={{ marginTop: 6, fontSize: 9, color: '#333' }}>
                              Data: {fmtDate(printVersion.content?.reviewedAt || content?.reviewedAt)}
                            </div>
                          </td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', width: '34%', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 700, marginBottom: 2 }}>Aprovado:</div>
                            <div>{printVersion.approvedBy || approvedBy || '—'}</div>
                            <div style={{ marginTop: 6, fontSize: 9, color: '#333' }}>
                              Data: {fmtDate(printVersion.content?.approvedAt || content?.approvedAt)}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>,
          portalTarget,
        )}
    </>
  );
}
