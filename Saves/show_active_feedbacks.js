const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const psqlCmd = `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" "postgresql://natum:Incorreta159753%23@127.0.0.1:5432/natumhub" -t -A -F "|||" -c "SELECT id, status, priority, type, page, description, \\"createdAt\\", requested_by FROM feedbacks WHERE status NOT IN ('resolved', 'wont_fix') ORDER BY priority ASC, \\"createdAt\\" ASC;"`;

try {
  const output = execSync(psqlCmd, { encoding: 'utf8' });
  const rows = output.trim().split('\n').filter(Boolean);
  console.log(`TOTAL ACTIVE FEEDBACKS: ${rows.length}`);
  rows.forEach((row, i) => {
    const parts = row.split('|||');
    console.log(`\n=================== FEEDBACK #${i + 1} ===================`);
    console.log(`ID: ${parts[0]}`);
    console.log(`Status: ${parts[1]}`);
    console.log(`Priority: ${parts[2]}`);
    console.log(`Type: ${parts[3]}`);
    console.log(`Page: ${parts[4]}`);
    console.log(`Created: ${parts[6]}`);
    console.log(`By: ${parts[7]}`);
    console.log(`Description:\n${parts[5]}`);
  });
} catch (e) {
  console.error(e);
}
