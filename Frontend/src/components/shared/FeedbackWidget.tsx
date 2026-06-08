import React, { useState, useEffect } from 'react';
import { Bug, MessageSquare, X, Upload, CheckCircle, Camera } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { api } from '../../lib/api';
import { getLogs } from '../../lib/logInterceptor';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface FeedbackWidgetProps {
  currentView?: string;
}

export function FeedbackWidget({ currentView }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'submit' | 'list'>('submit');
  const [type, setType] = useState<'bug' | 'feedback'>('bug');
  const [module, setModule] = useState('Geral');
  const [subPage, setSubPage] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string>(''); // base64
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && tab === 'list') {
      loadFeedbacks();
    }
  }, [isOpen, tab]);

  // Dynamically pre-populate module and subPage based on parent view context
  useEffect(() => {
    if (isOpen) {
      const pageName = (window as any).__current_page__ || '';
      if (currentView === 'compras') {
        setModule('Compras');
        setSubPage(pageName);
      } else if (currentView === 'microbiologia') {
        setModule('Microbiologia');
        setSubPage(pageName);
      } else if (currentView === 'producao') {
        setModule('Produção');
        setSubPage(pageName);
      } else if (currentView === 'producao_hub') {
        setModule('Produção');
        setSubPage('Hub');
      } else {
        setModule('Geral');
        setSubPage(pageName);
      }
    }
  }, [isOpen, currentView]);

  const loadFeedbacks = async () => {
    try {
      const data = await api.getFeedbacks();
      setFeedbacks(data);
    } catch (e) {
      console.error('Failed to load feedbacks:', e);
    }
  };

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
      // Small timeout to allow any hover states or clicks to settle
      await new Promise(resolve => setTimeout(resolve, 150));
      
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
        filter: (node: any) => {
          // Exclude the feedback modal trigger button and container from the capture
          if (node.classList && (
            node.classList.contains('feedback-widget-trigger') ||
            node.classList.contains('feedback-widget-container')
          )) {
            return false;
          }
          return true;
        },
        pixelRatio: 1, // Standard resolution (1x) is much faster and more than enough for bug reports
        cacheBust: false, // Disabling cache bust prevents reloading styles over local dev network
      });
      setScreenshot(dataUrl);
    } catch (err: any) {
      console.error('Failed to capture screen:', err);
      alert('Erro ao capturar a tela: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setLoading(true);
    try {
      const finalPage = `${module}${subPage.trim() ? ' > ' + subPage.trim() : ''}`;
      const fb = {
        id: crypto.randomUUID(),
        feedbackType: type,
        description,
        page: finalPage,
        logs: getLogs(),
        screenshot: screenshot || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await api.saveFeedback(fb);
      setDescription('');
      setScreenshot('');
      setTab('list');
      alert('Enviado com sucesso!');
    } catch (e: any) {
      console.error(e);
      alert('Erro ao enviar feedback: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.resolveFeedback(id);
      loadFeedbacks();
    } catch (e) {
      console.error(e);
      alert('Erro ao resolver');
    }
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
              <div className="flex gap-4">
                <button
                  onClick={() => setTab('submit')}
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    tab === 'submit' ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  Novo Report
                </button>
                <button
                  onClick={() => setTab('list')}
                  className={cn(
                    "text-sm font-semibold transition-colors flex items-center gap-1",
                    tab === 'list' ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  Lista
                  {feedbacks.filter(f => f.status === 'pending').length > 0 && (
                    <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                      {feedbacks.filter(f => f.status === 'pending').length}
                    </span>
                  )}
                </button>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'submit' ? (
                <div className="space-y-4" onPaste={handlePaste}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setType('bug')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer",
                        type === 'bug' ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      )}
                    >
                      <Bug className="h-4 w-4" /> Bug
                    </button>
                    <button
                      onClick={() => setType('feedback')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-semibold transition-colors cursor-pointer",
                        type === 'feedback' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      )}
                    >
                      <MessageSquare className="h-4 w-4" /> Feedback
                    </button>
                  </div>

                  {/* Module and Page Selection */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Módulo</label>
                      <select
                        value={module}
                        onChange={(e) => setModule(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all font-medium text-zinc-800"
                      >
                        <option value="Geral">Geral / Hub</option>
                        <option value="Produção">Produção</option>
                        <option value="Microbiologia">Microbiologia</option>
                        <option value="Compras">Compras</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Página / Aba</label>
                      <input
                        type="text"
                        placeholder="Ex: Dashboard, Estoque..."
                        value={subPage}
                        onChange={(e) => setSubPage(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all font-medium text-zinc-800 placeholder-zinc-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Descrição</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descreva o problema ou sugestão (Cole uma imagem com Ctrl+V se desejar)"
                      className="w-full h-24 px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none placeholder-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Print da Tela</label>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={captureScreen}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 p-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-700 font-semibold text-xs cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4 text-zinc-500" />
                        <span>{loading ? 'Capturando...' : 'Capturar Tela'}</span>
                      </button>
                      <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 p-2 border border-dashed border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-700 font-semibold text-xs">
                        <Upload className="h-4 w-4 text-zinc-400" />
                        <span>Enviar Arquivo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      </label>
                    </div>
                    {screenshot && (
                      <div className="mt-2 relative rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50">
                        <img src={screenshot} alt="Screenshot" className="w-full object-contain max-h-32" />
                        <button
                          onClick={() => setScreenshot('')}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-zinc-400 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                    * Os logs do console e o contexto da página serão anexados automaticamente para ajudar a equipe a resolver mais rápido.
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={loading || !description.trim()}
                    className="w-full p-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    {loading ? 'Enviando...' : 'Enviar Report'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {feedbacks.length === 0 ? (
                    <div className="text-center text-sm text-zinc-500 py-8">Nenhum feedback registrado.</div>
                  ) : (
                    feedbacks.map((f) => (
                      <div key={f.id} className={cn("border rounded-lg p-3", f.status === 'resolved' ? "bg-zinc-50 border-zinc-200 opacity-70" : "bg-white border-zinc-300 shadow-sm")}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {f.feedbackType === 'bug' ? (
                              <Bug className={cn("h-4 w-4", f.status === 'resolved' ? "text-zinc-400" : "text-red-500")} />
                            ) : (
                              <MessageSquare className={cn("h-4 w-4", f.status === 'resolved' ? "text-zinc-400" : "text-blue-500")} />
                            )}
                            <span className="text-xs font-semibold text-zinc-400">
                              {new Date(f.createdAt).toLocaleDateString()}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">
                              ID: {f.id.substring(0, 8)}
                            </span>
                          </div>
                          {f.status === 'pending' && (
                            <button
                              onClick={() => handleResolve(f.id)}
                              className="text-xs flex items-center gap-1 text-green-600 hover:text-green-700 font-bold transition-colors cursor-pointer"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Resolver
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-zinc-900 whitespace-pre-wrap mb-2 font-medium">{f.description}</p>
                        <div className="text-[10px] text-zinc-500 font-semibold bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-md inline-block mb-2">
                          {f.page}
                        </div>
                        {f.screenshot && (
                          <div className="mt-2 border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
                            <img src={f.screenshot} alt="Anexo" className="w-full object-contain max-h-32" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
