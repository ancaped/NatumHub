const { execSync } = require('child_process');

const psqlCmd = `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" "postgresql://natum:Incorreta159753%23@127.0.0.1:5432/natumhub" -t -A -c "SELECT json_agg(t) FROM (SELECT id, status, priority, type, page, description, \\"createdAt\\", requested_by FROM feedbacks WHERE status NOT IN ('resolved', 'wont_fix') ORDER BY priority ASC, \\"createdAt\\" ASC) t;"`;

try {
  const output = execSync(psqlCmd, { encoding: 'utf8' }).trim();
  const list = JSON.parse(output);
  console.log(`TOTAL ACTIVE FEEDBACKS: ${list.length}`);
  list.forEach((fb, i) => {
    console.log(`\n=================== FEEDBACK #${i + 1} ===================`);
    console.log(`ID: ${fb.id}`);
    console.log(`Status: ${fb.status}`);
    console.log(`Priority: ${fb.priority}`);
    console.log(`Type: ${fb.type}`);
    console.log(`Page: ${fb.page}`);
    console.log(`Created: ${fb.createdAt}`);
    console.log(`By: ${fb.requested_by}`);
    console.log(`Description:\n${fb.description}`);
  });
} catch (e) {
  console.error(e);
}
