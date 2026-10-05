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

async function main() {
  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.');
    
    const res = await client.query(`
      SELECT id, priority, status, type, page, description, requested_by, "createdAt"
      FROM feedbacks
      ORDER BY "createdAt" DESC
      LIMIT 4
    `);
    
    console.log('--- RECENT FEEDBACKS ---');
    for (const row of res.rows) {
      console.log(`[${row.createdAt}] ID: ${row.id} | Status: ${row.status} | Type: ${row.type} | By: ${row.requested_by}`);
      console.log(`Page: ${row.page}`);
      console.log(`Desc: ${row.description}`);
      console.log('--------------------------------------------------');
    }
    
    await client.end();
  } catch (err) {
    console.error('Database query error:', err.message);
  }
}

main();
