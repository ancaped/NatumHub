const fs = require('fs');
const path = require('path');
const { Client } = require('../Backend/node_modules/pg');

const envPath = path.join(__dirname, '../Saves/postgres.env');
let connStr = 'postgresql://natum:Incorreta159753%23@127.0.0.1:5432/natumhub';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('DATABASE_URL=')) {
      connStr = line.trim().substring('DATABASE_URL='.length).replace(/"/g, '');
    }
  }
}

function formatDate(raw) {
  if (!raw) return '-';
  const str = String(raw);
  if (str.includes('T')) {
    return str.replace('T', ' ').split('.')[0];
  }
  return str.split('.')[0];
}

async function main() {
  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT id, priority, status, type, page, description, requested_by, admin_notes, "createdAt", "resolvedAt"
      FROM feedbacks
      ORDER BY 
        CASE status
          WHEN 'in_progress' THEN 0
          WHEN 'queued' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'awaiting_review' THEN 3
          WHEN 'wont_fix' THEN 4
          WHEN 'resolved' THEN 5
          ELSE 6
        END,
        priority ASC,
        "createdAt" DESC
    `);

    const queue = [];
    const pending = [];
    const review = [];
    const wont_fix = [];
    const resolved = [];

    for (const row of res.rows) {
      const prio = row.priority ?? 100;
      const shortId = row.id.substring(0, 8);
      const reqBy = row.requested_by || '-';
      const created = formatDate(row.createdAt);
      const tipo = row.type === 'bug' ? '🔴 Bug' : '🔵 Sugestão/Feedback';
      const page = (row.page || '-').replace(/\n/g, ' ').replace(/\|/g, '\\|');
      const desc = (row.description || '').replace(/\n/g, ' ').replace(/\|/g, '\\|');
      const notes = (row.admin_notes || '').replace(/\n/g, ' ').replace(/\|/g, '\\|');

      const line = `| **${prio}** | \`${row.id}\` | \`${shortId}\` | ${reqBy} | ${created} | ${tipo} | ${page} | \`${row.status}\` | ${desc} | ${notes || '-'} |`;

      if (row.status === 'queued' || row.status === 'in_progress') {
        queue.push(line);
      } else if (row.status === 'pending') {
        pending.push(line);
      } else if (row.status === 'awaiting_review') {
        review.push(line);
      } else if (row.status === 'wont_fix') {
        wont_fix.push(`| **${prio}** | \`${shortId}\` | ${reqBy} | ${tipo} | ${page} | ${desc} |`);
      } else if (row.status === 'resolved') {
        const resDate = formatDate(row.resolvedAt);
        resolved.push(`| **${prio}** | \`${shortId}\` | ${reqBy} | ${tipo} | ${page} | ${resDate} |`);
      }
    }

    let md = `# Nexus — Playbook e Espelho de Feedbacks\n\n`;
    md += `> **Fonte oficial da verdade:** PostgreSQL, database \`natumhub\`. Credenciais em \`Saves/postgres.env\`.\n`;
    md += `> **Atualizado automaticamente:** ${new Date().toLocaleString('pt-BR')}\n\n`;
    md += `---\n\n`;

    md += `## 📋 1. Fila de Trabalho Ativa (queued / in_progress)\n\n`;
    if (queue.length === 0) {
      md += `_Nenhum item em andamento ou na fila no momento._\n\n`;
    } else {
      md += `| Prio | ID Completo | ID Curto | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas Admin |\n`;
      md += `| ---: | ----------- | -------- | ----------- | --------- | ---- | ------ | ------ | --------- | ----------- |\n`;
      md += queue.join('\n') + `\n\n`;
    }
    md += `---\n\n`;

    md += `## 🟡 2. Triagem (Novos Feedbacks Submetidos - pending)\n\n`;
    if (pending.length === 0) {
      md += `_Nenhum item em triagem no momento._\n\n`;
    } else {
      md += `| Prio | ID Completo | ID Curto | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas Admin |\n`;
      md += `| ---: | ----------- | -------- | ----------- | --------- | ---- | ------ | ------ | --------- | ----------- |\n`;
      md += pending.join('\n') + `\n\n`;
    }
    md += `---\n\n`;

    md += `## 🔵 3. Em Aberto (Aguardando Revisão do Supervisor - awaiting_review)\n\n`;
    if (review.length === 0) {
      md += `_Nenhum item aguardando revisão._\n\n`;
    } else {
      md += `| Prio | ID Completo | ID Curto | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas Admin |\n`;
      md += `| ---: | ----------- | -------- | ----------- | --------- | ---- | ------ | ------ | --------- | ----------- |\n`;
      md += review.join('\n') + `\n\n`;
    }
    md += `---\n\n`;

    md += `## ⛔ 4. Reprovados / Não Aplicáveis (wont_fix)\n\n`;
    if (wont_fix.length === 0) {
      md += `_Nenhum._\n\n`;
    } else {
      md += `| Prio | ID Curto | Solicitante | Tipo | Página | Motivo / Descrição |\n`;
      md += `| ---: | -------- | ----------- | ---- | ------ | ------------------ |\n`;
      md += wont_fix.join('\n') + `\n\n`;
    }
    md += `---\n\n`;

    md += `## 🟢 5. Finalizados Recentes (resolved)\n\n`;
    if (resolved.length === 0) {
      md += `_Nenhum._\n\n`;
    } else {
      md += `| Prio | ID Curto | Solicitante | Tipo | Página | Resolvido em |\n`;
      md += `| ---: | -------- | ----------- | ---- | ------ | ------------ |\n`;
      md += resolved.slice(0, 10).join('\n') + `\n\n`;
    }

    // Salva na raiz e em Feedbacks/
    fs.writeFileSync(path.join(__dirname, '../feedback.md'), md, 'utf8');
    fs.writeFileSync(path.join(__dirname, '../Feedbacks/feedback.md'), md, 'utf8');
    console.log('Successfully written feedback.md to root and Feedbacks/ folder.');

    await client.end();
  } catch (err) {
    console.error('Error generating feedback.md:', err.message);
  }
}

main();
