import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./nexus-mcp.mjs', import.meta.url));
const TOKEN = 'nxa_teste';

const ACOES = [
  {
    nome: 'consultar_item', modulo: 'compras', descricao: 'Consulta um item', metodo: 'GET',
    caminho: '/api/itens/:id', escrita: false, doisPassos: false, permitida: true,
    parametros: [
      { nome: 'id', onde: 'caminho', tipo: 'inteiro', obrigatorio: true, descricao: 'Id do item' },
      { nome: 'busca', onde: 'query', tipo: 'texto', obrigatorio: false, descricao: 'Filtro' },
    ],
  },
  { nome: 'gravar_item', modulo: 'compras', descricao: 'Grava', metodo: 'POST', caminho: '/api/itens', escrita: true, doisPassos: true, parametros: [], permitida: true },
  { nome: 'leitura_com_escrita', modulo: 'compras', descricao: 'x', metodo: 'GET', caminho: '/api/x', escrita: true, doisPassos: false, parametros: [], permitida: true },
];

test('servidor MCP do Nexus', async () => {
  const recebidas = [];
  const servidor = http.createServer((req, res) => {
    recebidas.push({ url: req.url, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/agentes/acoes') return res.end(JSON.stringify({ acoes: ACOES }));
    if (req.url.startsWith('/api/itens/')) return res.end(JSON.stringify({ eco: req.url }));
    res.statusCode = 404;
    res.end(JSON.stringify({ erro: { codigo: 'nao_encontrado', mensagem: 'sem rota' } }));
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}`;

  const filho = spawn(process.execPath, [SCRIPT], {
    env: { ...process.env, NEXUS_URL: url, NEXUS_TOKEN: TOKEN },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const respostas = new Map();
  const esperas = new Map();
  createInterface({ input: filho.stdout }).on('line', (l) => {
    const m = JSON.parse(l);
    respostas.set(m.id, m);
    esperas.get(m.id)?.(m);
  });
  let nextId = 1;
  const rpc = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    esperas.set(id, resolve);
    filho.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  try {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-03-26');
    assert.equal(init.result.serverInfo.name, 'nexus');
    filho.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const lista = await rpc('tools/list', {});
    assert.equal(lista.result.tools.length, 1);
    const t = lista.result.tools[0];
    assert.equal(t.name, 'consultar_item');
    assert.match(t.description, /módulo compras/);
    assert.equal(t.inputSchema.properties.id.type, 'integer');
    assert.deepEqual(t.inputSchema.required, ['id']);

    const ok = await rpc('tools/call', { name: 'consultar_item', arguments: { id: 7, busca: 'a b' } });
    assert.notEqual(ok.result.isError, true);
    assert.deepEqual(JSON.parse(ok.result.content[0].text), { eco: '/api/itens/7?busca=a+b' });
    const chamada = recebidas.find((r) => r.url.startsWith('/api/itens/'));
    assert.equal(chamada.auth, `Bearer ${TOKEN}`);

    const falta = await rpc('tools/call', { name: 'consultar_item', arguments: {} });
    assert.equal(falta.result.isError, true);

    const desconhecida = await rpc('tools/call', { name: 'gravar_item', arguments: {} });
    assert.equal(desconhecida.result.isError, true);

    const metodo = await rpc('nao/existe', {});
    assert.equal(metodo.error.code, -32601);
  } finally {
    filho.stdin.end();
    filho.kill();
    servidor.close();
  }
});
