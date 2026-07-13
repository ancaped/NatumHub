import sqlite3
from pathlib import Path

db = Path(r"C:\api\Saves\data.db")
conn = sqlite3.connect(db)
updates = [
    ("a1c0a024-05cd-4906-8a2e-068a5e3de852", "awaiting_review"),
]
for fid, status in updates:
    conn.execute(
        "UPDATE feedbacks SET status = ?, resolvedAt = NULL WHERE id = ?",
        (status, fid),
    )
    print(f"updated {fid[:8]} -> {status}")
conn.commit()
conn.close()
