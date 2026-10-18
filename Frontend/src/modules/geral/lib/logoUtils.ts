import { apiFetch } from './http';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

/**
 * Carrega a logo corporativa da empresa (cadastrada no módulo de configurações / qualidade / pops)
 * e converte para data URL base64 para uso síncrono em impressões e relatórios.
 */
export async function loadNatumLogoDataUrl(): Promise<string> {
  for (const path of ['/settings/report-logo', '/qualidade/pops/settings/logo']) {
    try {
      const res = await apiFetch(path);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') && blob.type !== 'image/svg+xml') continue;
      const url = await blobToDataUrl(blob);
      if (url) return url;
    } catch {
      continue;
    }
  }
  return '';
}
