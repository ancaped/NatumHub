const { execSync } = require('child_process');

const psqlCmd = `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" "postgresql://natum:Incorreta159753%23@127.0.0.1:5432/natumhub" -t -A -c "SELECT json_agg(t) FROM (SELECT id, feedback_id, author, body, created_at FROM feedback_notes WHERE feedback_id IN ('rtx125e5nvj', 's52yeds57lb') ORDER BY created_at ASC) t;"`;

try {
  const output = execSync(psqlCmd, { encoding: 'utf8' }).trim();
  console.log(output || '[]');
} catch (e) {
  console.error(e);
}
