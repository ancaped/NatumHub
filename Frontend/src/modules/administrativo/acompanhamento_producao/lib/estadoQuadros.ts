import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson } from '../../../geral/lib/http';

/**
 * Estado dos quadros do Acompanhamento (ordem manual, concluídos, liberados, filas manuais, caldeira, adiados).
 * Vive no servidor (igual para todos os operadores); antes ficava no localStorage de cada navegador.
 * Na primeira carga, o que ainda existir no localStorage é enviado uma vez ao servidor (só se a chave não existir
 * lá, registrado no histórico como "migrado do navegador") e a chave local é apagada.
 */
const ENDPOINT = '/api/administrativo/acompanhamento-producao/quadros-estado';
const ATUALIZAR_A_CADA_MS = 30_000;
const GRAVAR_APOS_MS = 400;
const CHAVES_LOCAIS_MORTAS = ['natum_etapas_status']; // era gravada e nunca lida

let cache: Record<string, unknown> | null = null;
let cacheEm = 0;
let carregando: Promise<Record<string, unknown>> | null = null;

async function carregarEstado(forcar = false): Promise<Record<string, unknown>> {
  if (!forcar && cache && Date.now() - cacheEm < 5_000) return cache;
  if (carregando) return carregando;
  carregando = apiJson<{ estado: Record<string, unknown> }>(ENDPOINT)
    .then(r => {
      cache = r?.estado || {};
      cacheEm = Date.now();
      return cache;
    })
    .finally(() => { carregando = null; });
  return carregando;
}

function lerLocal(chaveLocal: string): unknown | undefined {
  try {
    const s = localStorage.getItem(chaveLocal);
    return s == null ? undefined : JSON.parse(s);
  } catch {
    return undefined;
  }
}

function apagarLocal(chaveLocal: string) {
  try { localStorage.removeItem(chaveLocal); } catch { /* sem localStorage: nada a apagar */ }
}

function temConteudo(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v as object).some(temConteudo);
  return true;
}

interface Opcoes<T> {
  /** Converte o valor do estado para JSON (ex.: Set -> array). */
  paraJson?: (v: T) => unknown;
  /** Converte o JSON do servidor para o valor do estado (ex.: array -> Set). */
  deJson?: (j: unknown) => T;
  aoErro?: (mensagem: string) => void;
}

/**
 * Como `useState`, mas o valor é do servidor. `chave` é a chave do servidor; `chaveLocal` a do localStorage antigo
 * (só usada na migração única). Gravações são juntadas (400 ms) e a tela relê o servidor a cada 30 s e ao voltar o foco.
 */
export function useEstadoServidor<T>(chave: string, chaveLocal: string, inicial: T, opcoes: Opcoes<T> = {}) {
  const [valor, setValor] = useState<T>(inicial);
  const valorRef = useRef<T>(inicial);
  const op = useRef(opcoes);
  op.current = opcoes;
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = useRef(0);
  const carregado = useRef<Promise<void> | null>(null);

  const converterDoServidor = (j: unknown): T => (op.current.deJson ? op.current.deJson(j) : (j as T));
  const converterParaServidor = (v: T): unknown => (op.current.paraJson ? op.current.paraJson(v) : v);

  const enviar = useCallback(async (v: T, migrado = false) => {
    emVoo.current += 1;
    try {
      const r = await apiJson<{ gravado: boolean }>(ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ chave, valor: converterParaServidor(v), migradoDoNavegador: migrado }),
      });
      if (cache && !migrado) cache = { ...cache, [chave]: converterParaServidor(v) };
      return r;
    } catch (e: any) {
      console.error(`Erro ao gravar o estado "${chave}" no servidor:`, e);
      op.current.aoErro?.(`Não foi possível salvar "${chave}" no servidor: ${e?.message || e}`);
      return null;
    } finally {
      emVoo.current -= 1;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  // Carga inicial + migração única do localStorage.
  useEffect(() => {
    let vivo = true;
    carregado.current = (async () => {
      try {
        const estado = await carregarEstado(true);
        CHAVES_LOCAIS_MORTAS.forEach(apagarLocal);
        const local = lerLocal(chaveLocal);
        if (chave in estado) {
          if (vivo) { const v = converterDoServidor(estado[chave]); valorRef.current = v; setValor(v); }
          if (local !== undefined) apagarLocal(chaveLocal); // o servidor vence
        } else if (local !== undefined && temConteudo(local)) {
          const v = converterDoServidor(local);
          const r = await enviar(v, true);
          if (r) {
            apagarLocal(chaveLocal);
            if (vivo) { valorRef.current = v; setValor(v); }
          }
        } else if (local !== undefined) {
          apagarLocal(chaveLocal);
        }
      } catch (e) {
        console.error(`Erro ao carregar o estado "${chave}" do servidor:`, e);
      }
    })();
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, chaveLocal]);

  // Releitura periódica e ao voltar o foco, sem pisar em gravação em andamento.
  useEffect(() => {
    let vivo = true;
    const reler = async () => {
      if (pendente.current || emVoo.current > 0) return;
      try {
        const estado = await carregarEstado();
        if (!vivo || pendente.current || emVoo.current > 0 || !(chave in estado)) return;
        const doServidor = converterDoServidor(estado[chave]);
        if (JSON.stringify(converterParaServidor(doServidor)) !== JSON.stringify(converterParaServidor(valorRef.current))) {
          valorRef.current = doServidor;
          setValor(doServidor);
        }
      } catch { /* sem rede: tenta no próximo ciclo */ }
    };
    const id = setInterval(reler, ATUALIZAR_A_CADA_MS);
    const aoFocar = () => { if (document.visibilityState === 'visible') void reler(); };
    document.addEventListener('visibilitychange', aoFocar);
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', aoFocar); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const definir = useCallback((u: T | ((prev: T) => T)) => {
    const proximo = typeof u === 'function' ? (u as (prev: T) => T)(valorRef.current) : u;
    valorRef.current = proximo;
    setValor(proximo);
    if (pendente.current) clearTimeout(pendente.current);
    pendente.current = setTimeout(async () => {
      pendente.current = null;
      try { await carregado.current; } catch { /* a carga já registra o erro */ }
      await enviar(valorRef.current);
    }, GRAVAR_APOS_MS);
  }, [enviar]);

  return [valor, definir] as const;
}

export const paraSet = (j: unknown): Set<string> => new Set(Array.isArray(j) ? (j as string[]) : []);
export const deSet = (s: Set<string>): string[] => Array.from(s);
