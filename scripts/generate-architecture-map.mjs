#!/usr/bin/env node
/**
 * Gera ContextoIA/arquitetura/mapa-app.json + mapa-app.html
 * Merge: scan FE/BE + mapa-curated.json → template HTML
 * Uso: node scripts/generate-architecture-map.mjs
 * CI: --check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ARCH = path.join(ROOT, 'ContextoIA', 'arquitetura');
const OUT_JSON = path.join(ARCH, 'mapa-app.json');
const OUT_HTML = path.join(ARCH, 'mapa-app.html');
const CURATED = path.join(ARCH, 'mapa-curated.json');
const TEMPLATE = path.join(ARCH, 'mapa-app.template.html');
const CHECK = process.argv.includes('--check');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function extractRoutes() {
  const src = path.join(ROOT, 'Backend', 'src');
  const files = walk(src).filter((f) => f.endsWith('.rs'));
  const routes = [];
  const routeRe = /\.route\(\s*"([^"]+)"\s*,\s*([\s\S]*?)\)\s*(?:\.|$|;)/g;

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    const re = new RegExp(routeRe);
    while ((m = re.exec(text))) {
      const routePath = m[1];
      const chain = m[2].replace(/\s+/g, ' ');
      const methods = [];
      for (const meth of ['get', 'post', 'put', 'delete', 'patch']) {
        if (new RegExp(`\\b${meth}\\s*\\(`).test(chain)) methods.push(meth.toUpperCase());
      }
      if (!methods.length) continue;
      routes.push({ path: routePath, methods, source: rel(file) });
    }
  }

  routes.sort((a, b) => a.path.localeCompare(b.path) || a.methods.join().localeCompare(b.methods.join()));
  const seen = new Set();
  return routes.filter((r) => {
    const k = `${r.methods.join(',')}|${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function listMigrations() {
  const dir = path.join(ROOT, 'Backend', 'supabase');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: `Backend/supabase/${f}`, id: f.replace(/\.sql$/, '') }));
}

function listFrontendViews() {
  const mods = path.join(ROOT, 'Frontend', 'src', 'modules');
  return walk(mods)
    .filter((f) => f.endsWith('View.tsx'))
    .map((f) => rel(f))
    .sort();
}

function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'Frontend', 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function loadCurated() {
  if (!fs.existsSync(CURATED)) return {};
  return JSON.parse(fs.readFileSync(CURATED, 'utf8'));
}

const MODULE_GROUPS = [
  {
    key: 'estoque',
    label: 'Estoque',
    hubView: 'estoque_hub',
    children: [
      'estoque_materia_prima',
      'estoque_embalagens',
      'estoque_coloracao',
      'estoque_apoio',
      'estoque_ordens_manuais',
      'estoque_produtos',
      'estoque_previsao_uso',
    ],
  },
  {
    key: 'almoxarifado',
    label: 'Almoxarifado',
    hubView: 'almoxarifado_hub',
    children: [
      'estoque_itens',
      'estoque_almoxarifado',
      'estoque_supermercado',
      'estoque_pecas',
      'estoque_equipamentos',
      'estoque_manutencoes',
      'estoque_movimentacoes',
    ],
  },
  {
    key: 'producao',
    label: 'Produção',
    hubView: 'producao_hub',
    children: ['producao', 'producao_bases', 'producao_lotes', 'montagem_kits', 'microbiologia', 'fisco_quimica'],
  },
  {
    key: 'compras',
    label: 'Compras',
    hubView: 'compras_hub',
    children: [
      'compras_materia_prima',
      'compras_embalagens',
      'compras_coloracao',
      'compras_apoio',
      'compras_quotations',
      'compras_online',
      'compras_pedidos',
      'compras_notas',
      'compras_almoxarifado',
      'compras_simulation',
    ],
  },
  {
    key: 'vendas',
    label: 'Vendas',
    hubView: 'vendas_hub',
    children: ['vendas', 'vendas_online'],
  },
  {
    key: 'qualidade',
    label: 'Qualidade',
    hubView: 'qualidade_hub',
    children: [
      'controle_qualidade',
      'qualidade_pops',
      'qualidade_treinamentos',
      'qualidade_temperatura',
      'qualidade_limpeza',
      'qualidade_recebimento_mp',
      'qualidade_documentacao',
    ],
  },
  {
    key: 'administrativo',
    label: 'Administrativo',
    hubView: 'administrativo',
    children: ['admin_linha_produtos'],
  },
  {
    key: 'expedicao',
    label: 'Expedição',
    hubView: 'expedicao_hub',
    children: ['expedicao_ecommerce'],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    hubView: 'financeiro',
    children: ['financeiro'],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    hubView: 'hub',
    children: ['hub_settings', 'hub_operadores'],
  },
];

function labelFromKey(key) {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function matchPrefix(pathStr, prefixes) {
  const sorted = [...prefixes].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find((p) => pathStr === p.prefix || pathStr.startsWith(p.prefix + '/') || pathStr.startsWith(p.prefix));
}

function inferAuth(pathStr) {
  if (pathStr.startsWith('/api/admin') || pathStr.includes('/operators/manage') || pathStr.includes('/devices/manage')) {
    return 'supervisor';
  }
  if (pathStr === '/api/health' || pathStr.startsWith('/api/auth/login') || pathStr.startsWith('/api/hub/public')) {
    return 'public';
  }
  return 'module';
}

function buildModules(curated, routeCatalog) {
  const curatedMods = curated.modules || {};
  const modules = {};

  for (const g of MODULE_GROUPS) {
    for (const key of g.children) {
      const c = curatedMods[key] || {};
      const routes = routeCatalog
        .filter((r) => r.moduleKey === key)
        .map((r) => {
          const sig = `${r.methods.join('|')} ${r.path}`;
          const byMethodPath = `${r.methods[0]} ${r.path}`;
          const summary =
            c.routeSummaries?.[byMethodPath] ||
            c.routeSummaries?.[sig] ||
            r.summary ||
            '';
          return {
            methods: r.methods,
            path: r.path,
            summary,
            auth: r.auth,
            source: r.source,
          };
        });

      modules[key] = {
        key,
        label: c.label || labelFromKey(key),
        group: g.key,
        purpose: c.purpose || `Submódulo ${labelFromKey(key)} do grupo ${g.label}.`,
        status: c.status || (routes.length ? 'live' : 'stub'),
        frontend: c.frontend || null,
        backend: c.backend || null,
        permissions: c.permissions || { rolesDefault: [], supervisorOnly: false },
        data: c.data || { tables: [], filesOnDisk: [] },
        routes,
        connectsTo: c.connectsTo || [{ target: 'auth', kind: 'guard', note: `module_key ${key}` }],
        aiHints: c.aiHints || [],
      };
    }
  }

  // curated-only extras (infra-linked modules already in groups)
  for (const [key, c] of Object.entries(curatedMods)) {
    if (modules[key]) continue;
    modules[key] = {
      key,
      label: c.label || labelFromKey(key),
      group: c.group || 'sistema',
      purpose: c.purpose || '',
      status: c.status || 'stub',
      frontend: c.frontend || null,
      backend: c.backend || null,
      permissions: c.permissions || { rolesDefault: [], supervisorOnly: false },
      data: c.data || { tables: [], filesOnDisk: [] },
      routes: [],
      connectsTo: c.connectsTo || [],
      aiHints: c.aiHints || [],
    };
  }

  return modules;
}

function buildEdges(modules) {
  const edges = [];
  const seen = new Set();
  for (const m of Object.values(modules)) {
    for (const c of m.connectsTo || []) {
      const id = `${m.key}->${c.target}:${c.kind}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ from: m.key, to: c.target, kind: c.kind, note: c.note || '' });
    }
  }
  return edges;
}

function buildMap(httpRoutes) {
  const curated = loadCurated();
  const migrations = listMigrations();
  const frontendViews = listFrontendViews();
  const prefixes = curated.routePrefixes || [];

  const routeCatalog = httpRoutes.map((r) => {
    const hit = matchPrefix(r.path, prefixes);
    const methodPath = `${r.methods[0]} ${r.path}`;
    const modKey = hit?.moduleKey || null;
    const curatedMod = modKey ? curated.modules?.[modKey] : null;
    const summary =
      curatedMod?.routeSummaries?.[methodPath] ||
      hit?.summary ||
      '';
    return {
      ...r,
      moduleKey: modKey,
      summary,
      auth: inferAuth(r.path),
    };
  });

  const modules = buildModules(curated, routeCatalog);
  const edges = buildEdges(modules);

  return {
    meta: {
      name: 'NatumHub',
      generatedAt: new Date().toISOString(),
      version: packageVersion(),
      generator: 'scripts/generate-architecture-map.mjs',
      schemaVersion: 2,
      editable: {
        version: {
          value: packageVersion(),
          targets: [
            'Frontend/package.json',
            'Backend/package.json',
            'Backend/Cargo.toml',
            'Backend/tauri.conf.json',
          ],
        },
        taskFile: 'task.md',
      },
    },
    runtime: {
      stack: ['Tauri 2', 'React', 'Vite', 'Axum', 'PostgreSQL', 'SQL Server (ERP sync)'],
      api: { port: 3001, bindDefault: '0.0.0.0', auth: 'Bearer + X-Natum-Device-Id' },
      masterClient: {
        master: 'Sobe Axum :3001, Postgres local (Saves/postgres.env), sync ERP, backups, updater',
        client: 'Só UI; apiOrigin → PC Principal; sem Postgres local',
      },
      data: {
        hub: 'PostgreSQL (obrigatório no master)',
        erp: 'SQL Server → sync incremental/full via legacy_db / erp-import',
        files: 'Saves/ (documentacao, receipts, pg-backups)',
        notUsed: 'SQLite / data.db',
      },
    },
    repos: {
      Frontend: 'UI React + Vite (dist → Tauri)',
      Backend: 'Tauri + Axum + módulos de domínio',
      'erp-import': 'Queries SQL Server + PASSOS de sync',
      Saves: 'postgres.env, client_config.json (não versionar secrets)',
      ContextoIA: 'Docs para agentes + mapa-app',
      Feedbacks: 'Playbook de bugs (dados no Postgres)',
      scripts: 'Release / geradores',
    },
    moduleGroups: MODULE_GROUPS,
    modules,
    edges,
    infraNodes: curated.infraNodes || {},
    glossary: curated.glossary || {},
    phase2: curated.phase2 || {},
    routeCatalog,
    httpRoutes: routeCatalog,
    backendModules: [
      { id: 'geral', path: 'Backend/src/modules/geral', router: 'modules::geral::router()', notes: 'auth, hub, notifications, audit, settings' },
      { id: 'compras', path: 'Backend/src/modules/compras', router: 'modules::compras::router()' },
      { id: 'estoque', path: 'Backend/src/modules/estoque', router: 'modules::estoque::router()' },
      { id: 'financeiro', path: 'Backend/src/modules/financeiro', router: 'modules::financeiro::router()' },
      { id: 'expedicao', path: 'Backend/src/modules/expedicao', router: 'modules::expedicao::router()' },
      { id: 'qualidade', path: 'Backend/src/modules/qualidade', router: 'modules::qualidade::router()' },
      { id: 'hub_api', path: 'Backend/src/modules/hub_api', router: 'modules::hub_api::router()' },
      { id: 'producao', path: 'Backend/src/modules/producao', router: null, notes: 'rotas inline lib.rs' },
      { id: 'vendas', path: 'Backend/src/modules/vendas', router: null, notes: 'rotas inline lib.rs' },
    ],
    frontendModules: frontendViews.map((p) => ({ view: path.basename(p), path: p })),
    infra: [
      { id: 'auth', path: 'Backend/src/modules/geral/auth', role: 'login, sessions, middleware' },
      { id: 'audit', path: 'Backend/src/modules/geral/audit', role: 'hub_audit_events' },
      { id: 'notifications', path: 'Backend/src/modules/geral/notifications', role: 'hub_notifications' },
      { id: 'postgres_bootstrap', path: 'Backend/src/modules/geral/postgres_bootstrap', role: 'migrations embutidas' },
      { id: 'erp_sync', path: 'Backend/src/modules/geral/configuracoes/erp_sync_scheduler.rs', role: 'agenda sync ERP' },
      { id: 'pg_backup', path: 'Backend/src/modules/geral/configuracoes/pg_backup.rs', role: 'backup local' },
    ],
    migrations,
    keyFlows: [
      { id: 'login', steps: ['LoginView', 'POST /api/auth/login', 'Bearer', 'GET /api/auth/me'] },
      { id: 'api_write', steps: ['apiJson', 'auth_middleware', 'handler', 'audit hub_audit_events'] },
      { id: 'erp_sync', steps: ['scheduler ou POST /api/import/sync', 'legacy_db', 'Postgres'] },
      { id: 'new_module', steps: ['Propor no mapa-app.html', 'SPEC JSON', 'skill natumhub-modulos', 'npm run map:arch'] },
    ],
    docs: [
      'ContextoIA/INDEX.md',
      'ContextoIA/arquitetura/mapa-app.html',
      'ContextoIA/arquitetura/mapa-app.json',
      'ContextoIA/arquitetura/mapa-curated.json',
      'ContextoIA/modulos/criacao.md',
      'AGENTS.md',
    ],
    stats: {
      httpRouteEntries: routeCatalog.length,
      migrations: migrations.length,
      frontendViews: frontendViews.length,
      modules: Object.keys(modules).length,
      edges: edges.length,
    },
  };
}

function renderHtml(map) {
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error('Template ausente: ' + TEMPLATE);
  }
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const jsonLiteral = JSON.stringify(map).replace(/</g, '\\u003c');
  if (!tpl.includes('__MAPA_JSON__')) {
    throw new Error('Template sem placeholder __MAPA_JSON__');
  }
  return tpl.replace('__MAPA_JSON__', jsonLiteral);
}

const routes = extractRoutes();
const map = buildMap(routes);
const jsonText = `${JSON.stringify(map, null, 2)}\n`;
const htmlText = renderHtml(map);

if (CHECK) {
  if (!fs.existsSync(OUT_JSON)) {
    console.error('mapa-app.json ausente — rode sem --check primeiro');
    process.exit(1);
  }
  const current = fs.readFileSync(OUT_JSON, 'utf8');
  const normalize = (s) => {
    const o = JSON.parse(s);
    o.meta.generatedAt = 'STABLE';
    return JSON.stringify(o, null, 2);
  };
  if (normalize(current) !== normalize(jsonText)) {
    console.error('mapa-app.json desatualizado. Rode: node scripts/generate-architecture-map.mjs');
    process.exit(1);
  }
  console.log('OK: mapa sincronizado (' + map.stats.httpRouteEntries + ' rotas, ' + map.stats.modules + ' módulos)');
  process.exit(0);
}

fs.writeFileSync(OUT_JSON, jsonText);
fs.writeFileSync(OUT_HTML, htmlText);
console.log('Wrote', rel(OUT_JSON));
console.log('Wrote', rel(OUT_HTML));
console.log('Routes:', map.stats.httpRouteEntries, '| Modules:', map.stats.modules, '| Edges:', map.stats.edges);
