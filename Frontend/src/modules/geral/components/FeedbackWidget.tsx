import React, { useState, useEffect } from 'react';
import { Bug, MessageSquare, X, Upload, Camera } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { api } from '../lib/api';
import { getLogs } from '../lib/logInterceptor';
import { cn, randomId } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { buildFeedbackPagePath, splitFeedbackPagePath } from '../lib/viewLabels';

interface FeedbackWidgetProps {
  currentView?: string;
  visible?: boolean;
}

export function FeedbackWidget({ currentView, visible = false }: FeedbackWidgetProps) {
  if (!visible) return null;
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'bug' | 'feedback'>('bug');
  const [module, setModule] = useState('Geral');
  const [subPage, setSubPage] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string>('');
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const path = buildFeedbackPagePath(currentView);
      const { module: mod, subPage: sub } = splitFeedbackPagePath(path);
      setModule(mod);
      setSubPage(sub);
    }
  }, [isOpen, currentView]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target?.result) setScreenshot(ev.target.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setScreenshot(ev.target.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const captureScreen = async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));

      const dataUrl = await htmlToImage.toPng(document.body, {
        width: window.innerWidth,
        height: window.innerHeight,
        style: {
          width: window.innerWidth + 'px',
          height: window.innerHeight + 'px',
          transform: 'none',
          left: '0',
          top: '0',
        },
        filter: (node: HTMLElement) => {
          if (
            node.classList &&
            (node.classList.contains('feedback-widget-trigger') ||
              node.classList.contains('feedback-widget-container'))
          ) {
            return false;
          }
          return true;
        },
        pixelRatio: 1,
        cacheBust: false,
      });
      setScreenshot(dataUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to capture screen:', err);
      alert('Erro ao capturar a tela: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setLoading(true);
    try {
      const finalPage = subPage.trim()
        ? `${module} > ${subPage.trim()}`
        : (module || buildFeedbackPagePath(currentView));
      await api.submitFeedback({
        id: randomId(),
        feedbackType: type,
        description,
        page: finalPage,
        logs: getLogs(),
        screenshot: includeScreenshot && screenshot ? screenshot : '',
      });
      setDescription('');
      setScreenshot('');
      setIncludeScreenshot(false);
      setSent(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(e);
      alert('Erro ao enviar feedback: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSent(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="feedback-widget-trigger fixed bottom-6 right-6 w-12 h-12 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-zinc-800 transition-colors z-50 group"
        title="Enviar Feedback / Reportar Bug"
      >
        <Bug className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="feedback-widget-container fixed bottom-24 right-6 w-[400px] max-h-[80vh] bg-white rounded-xl shadow-2xl border border-zinc-200 flex flex-col z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-100 bg-zinc-50">
              <span className="text-sm font-semibold text-zinc-900">Novo Report</span>
              <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {sent ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-900">Feedback enviado!</p>
                  <p className="text-xs text-zinc-500">
                    Seu report foi registrado com data, hora e seu nome. O administrador fará a triagem.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="text-xs font-bold text-zinc-600 hover:text-zinc-900 cursor-pointer"
                  >
                    Enviar outro
                  </button>
                </div>
              ) : (
                <div className="space-y-4" onPaste={handlePaste}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setType('bug')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer',
                        type === 'bug'
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      )}
                    >
                      <Bug className="h-4 w-4" /> Bug
                    </button>
                    <button
                      onClick={() => setType('feedback')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer',
                        type === 'feedback'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      )}
                    >
                      <MessageSquare className="h-4 w-4" /> Feedback
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                        Módulo
                      </label>
                      <select
                        value={module}
                        onChange={(e) => setModule(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-800"
                      >
                        <option value="Geral">Geral / Hub</option>
                        <option value="Produção">Produção</option>
                        <option value="Compras">Compras</option>
                        <option value="Estoque">Estoque</option>
                        <option value="Vendas">Vendas</option>
                        <option value="Financeiro">Financeiro</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                        Página / Aba
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Dashboard, Estoque..."
                        value={subPage}
                        onChange={(e) => setSubPage(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-800 placeholder-zinc-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                      Descrição
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descreva o problema ou sugestão (Cole uma imagem com Ctrl+V se desejar)"
                      className="w-full h-24 px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none placeholder-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeScreenshot}
                        onChange={(e) => {
                          setIncludeScreenshot(e.target.checked);
                          if (!e.target.checked) setScreenshot('');
                        }}
                        className="rounded border-zinc-300"
                      />
                      Anexar captura de tela (opcional)
                    </label>
                    {includeScreenshot && (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={captureScreen}
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 p-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 text-zinc-700 font-semibold text-xs cursor-pointer disabled:opacity-50"
                          >
                            <Camera className="h-4 w-4 text-zinc-500" />
                            <span>{loading ? 'Capturando...' : 'Capturar Tela'}</span>
                          </button>
                          <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 p-2 border border-dashed border-zinc-200 rounded-lg hover:bg-zinc-50 text-zinc-700 font-semibold text-xs">
                            <Upload className="h-4 w-4 text-zinc-400" />
                            <span>Enviar Arquivo</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                          </label>
                        </div>
                        {screenshot && (
                          <div className="mt-2 relative rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50">
                            <img src={screenshot} alt="Screenshot" className="w-full object-contain max-h-32" />
                            <button
                              type="button"
                              onClick={() => setScreenshot('')}
                              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="text-[10px] text-zinc-400 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                    Seu nome, data e hora serão registrados automaticamente. Logs do console e contexto da página são anexados.
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={loading || !description.trim()}
                    className="w-full p-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    {loading ? 'Enviando...' : 'Enviar Report'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
