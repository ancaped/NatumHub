import React, { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { apiFetch } from '../lib/http';

export default function ReportLogoPanel({
  canUpload,
  setMessage,
}: {
  canUpload: boolean;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}) {
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await apiFetch('/settings/report-logo');
      if (!res.ok) {
        setSrc('');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setSrc((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setSrc('');
    }
  };

  useEffect(() => {
    void load();
    return () => {
      setSrc((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, []);

  const upload = async (file: File | null) => {
    if (!file || !canUpload) return;
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/settings/report-logo', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao enviar a logo');
      }
      await load();
      setMessage({ text: 'Logo dos relatórios atualizada.', type: 'success' });
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : 'Falha ao enviar a logo', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-zinc-900">Logo dos relatórios</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Esta imagem entra no cabeçalho dos relatórios. PNG, JPG, WEBP, GIF ou SVG, até 2 MB.
        </p>
      </div>
      <div className="h-24 w-44 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={src} alt="Logo dos relatórios" className="max-h-20 max-w-40 object-contain" />
        ) : (
          <span className="text-xs text-zinc-400">Nenhuma logo</span>
        )}
      </div>
      {canUpload ? (
        <label className="btn-primary inline-flex items-center gap-2 cursor-pointer">
          <ImagePlus className="h-4 w-4" />
          {busy ? 'Enviando…' : 'Enviar logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = '';
              void upload(file);
            }}
          />
        </label>
      ) : (
        <p className="text-xs text-zinc-500">Somente o supervisor pode trocar a logo.</p>
      )}
    </section>
  );
}
