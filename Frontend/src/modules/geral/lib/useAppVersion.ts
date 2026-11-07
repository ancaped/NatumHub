import { useEffect, useState } from 'react';
import { checkServerHealth } from './connectionConfig';

let cache: string | null = null;
let pendente: Promise<string | null> | null = null;

function buscar(): Promise<string | null> {
  if (cache) return Promise.resolve(cache);
  if (!pendente) {
    pendente = checkServerHealth()
      .then((h) => {
        cache = h.ok && h.version ? h.version : null;
        return cache;
      })
      .catch(() => null)
      .finally(() => {
        pendente = null;
      });
  }
  return pendente;
}

/** Versão real do servidor (`/api/health` → `version`, ex.: 0.2.412). `null` enquanto carrega ou se o servidor não responder. */
export function useAppVersion(): string | null {
  const [versao, setVersao] = useState<string | null>(cache);
  useEffect(() => {
    let vivo = true;
    if (!cache) {
      buscar().then((v) => {
        if (vivo) setVersao(v);
      });
    }
    return () => {
      vivo = false;
    };
  }, []);
  return versao;
}
