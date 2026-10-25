#!/usr/bin/env node
// Servidor MCP mínimo do Nexus, somente leitura, por stdio (JSON-RPC 2.0, uma mensagem por linha).
// Expõe como ferramentas as ações GET sem escrita do catálogo /api/agentes/acoes.
import { createInterface } from 'node:readline';

const VERSAO = '0.1.0';
const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 30_000;
const LIMITE_RESPOSTA = 100 * 1024;

const URL_BASE = (process.env.NEXUS_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.NEXUS_TOKEN || '';

const log = (msg) => process.stderr.write(`[nexus-mcp] ${msg}\n`);

if (!URL_BASE || !TOKEN) {
  log('configure NEXUS_URL (ex.: http://100.64.207.54:3001) e NEXUS_TOKEN (token de agente nxa_...); as chamadas vão falhar até lá.');
}

let cache = { em: 0, acoes: [] };

async function pedir(caminho) {
  const resp = await fetch(URL_BASE + caminho, {
    method: 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await resp.text();
  let corpo;
  try { corpo = JSON.parse(texto); } catch { corpo = texto; }
  return { status: resp.status, corpo };
}

function exigirConfig() {
  if (!URL_BASE || !TOKEN) throw new Error('NEXUS_URL e NEXUS_TOKEN não configurados no ambiente do servidor MCP.');
}

async function carregarAcoes(forcar = false) {
  exigirConfig();
  if (!forcar && Date.now() - cache.em < CACHE_MS) return cache.acoes;
  const { status, corpo } = await pedir('/api/agentes/acoes');
  if (status >= 400) throw new Error(`Nexus respondeu HTTP ${status} ao listar ações: ${descreverErro(corpo)}`);
  const todas = Array.isArray(corpo?.acoes) ? corpo.acoes : [];
  cache = { em: Date.now(), acoes: todas.filter((a) => a.metodo === 'GET' && a.escrita === false) };
  return cache.acoes;
}

function descreverErro(corpo) {
  if (corpo && typeof corpo === 'object') {
    const e = corpo.erro ?? corpo;
    const codigo = e.codigo ?? '';
    const msg = e.mensagem ?? e.message ?? '';
    if (codigo || msg) return `${codigo} ${msg}`.trim();
    return JSON.stringify(corpo);
  }
  return String(corpo);
}

function tipoJson(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'inteiro') return 'integer';
  if (t === 'numero' || t === 'número') return 'number';
  if (t === 'booleano') return 'boolean';
  return 'string';
}

function paraFerramenta(a) {
  const parametros = a.parametros || [];
  const properties = {};
  for (const p of parametros) {
    properties[p.nome] = { type: tipoJson(p.tipo), description: p.descricao || '' };
  }
  return {
    name: a.nome,
    description: `${a.descricao || a.nome} (módulo ${a.modulo})`,
    inputSchema: {
      type: 'object',
      properties,
      required: parametros.filter((p) => p.obrigatorio).map((p) => p.nome),
    },
  };
}

function resultadoTexto(texto, isError = false) {
  const r = { content: [{ type: 'text', text: texto }] };
  if (isError) r.isError = true;
  return r;
}

async function chamarFerramenta(nome, args = {}) {
  let acoes = await carregarAcoes();
  let acao = acoes.find((a) => a.nome === nome);
  if (!acao) {
    acoes = await carregarAcoes(true);
    acao = acoes.find((a) => a.nome === nome);
  }
  if (!acao) return resultadoTexto(`Ferramenta desconhecida ou não somente leitura: ${nome}`, true);

  const parametros = acao.parametros || [];
  const usados = new Set();
  let caminho = acao.caminho;
  for (const p of parametros.filter((x) => x.onde === 'caminho')) {
    const v = args[p.nome];
    if (v === undefined || v === null || v === '') {
      return resultadoTexto(`Parâmetro obrigatório ausente: ${p.nome}`, true);
    }
    caminho = caminho.replace(`:${p.nome}`, encodeURIComponent(String(v)));
    usados.add(p.nome);
  }
  const query = new URLSearchParams();
  for (const p of parametros.filter((x) => x.onde !== 'caminho')) {
    const v = args[p.nome];
    if (v === undefined || v === null || v === '') {
      if (p.obrigatorio) return resultadoTexto(`Parâmetro obrigatório ausente: ${p.nome}`, true);
      continue;
    }
    query.append(p.nome, String(v));
  }
  const qs = query.toString();
  const { status, corpo } = await pedir(qs ? `${caminho}${caminho.includes('?') ? '&' : '?'}${qs}` : caminho);

  let texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo, null, 2);
  if (Buffer.byteLength(texto) > LIMITE_RESPOSTA) {
    texto = texto.slice(0, LIMITE_RESPOSTA) + '\n\n[resposta cortada; use filtros/paginação (limite/pagina)]';
  }
  if (status >= 400) {
    texto = `HTTP ${status}: ${descreverErro(corpo)}\n${texto}`;
    return resultadoTexto(texto, true);
  }
  return resultadoTexto(texto);
}

async function tratar(msg) {
  const { method, params } = msg;
  switch (method) {
    case 'initialize': {
      const pedido = params?.protocolVersion;
      return {
        protocolVersion: PROTOCOLOS.includes(pedido) ? pedido : PROTOCOLOS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'nexus', version: VERSAO },
      };
    }
    case 'ping':
      return {};
    case 'tools/list': {
      const acoes = await carregarAcoes();
      return { tools: acoes.map(paraFerramenta) };
    }
    case 'tools/call':
      try {
        return await chamarFerramenta(params?.name, params?.arguments || {});
      } catch (e) {
        return resultadoTexto(`Falha ao chamar o Nexus: ${e.message}`, true);
      }
    default: {
      const err = new Error(`Método não encontrado: ${method}`);
      err.codigo = -32601;
      throw err;
    }
  }
}

function enviar(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const rl = createInterface({ input: process.stdin });
const pendentes = new Set();
rl.on('line', (linha) => {
  if (!linha.trim()) return;
  let msg;
  try { msg = JSON.parse(linha); } catch {
    enviar({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
    return;
  }
  const ehNotificacao = msg.id === undefined || msg.id === null;
  const p = (async () => {
    try {
      const resultado = await tratar(msg);
      if (!ehNotificacao) enviar({ jsonrpc: '2.0', id: msg.id, result: resultado });
    } catch (e) {
      if (ehNotificacao) return;
      enviar({ jsonrpc: '2.0', id: msg.id, error: { code: e.codigo ?? -32603, message: e.message } });
    }
  })();
  pendentes.add(p);
  p.finally(() => pendentes.delete(p));
});
rl.on('close', async () => {
  await Promise.all(pendentes);
  process.exit(0);
});
