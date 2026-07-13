import sqlite3
import sys

db = r"C:\api\Saves\data.db"
lote = sys.argv[1] if len(sys.argv) > 1 else "15100"
conn = sqlite3.connect(db)
cur = conn.cursor()

cur.execute(
    "SELECT document_number, item_code, quantity, date FROM stock_movements "
    "WHERE document_number LIKE ? LIMIT 10",
    (f"%{lote}%",),
)
rows = cur.fetchall()
print(f"LIKE %{lote}%: {len(rows)} rows")
for r in rows:
    print(" ", r)

cur.execute(
    "SELECT document_number, item_code, item_type, movement_type, quantity "
    "FROM stock_movements WHERE document_number = ?",
    (lote,),
)
print(f"all movements for '{lote}':")
for r in cur.fetchall():
    print(" ", r)

cur.execute(
    "SELECT m.item_code, COALESCE(p.descricao, ''), m.quantity "
    "FROM stock_movements m LEFT JOIN produtos p ON m.item_code = p.codigo "
    "WHERE m.document_number = ? AND m.item_type = 'produto' AND m.movement_type = 'entrada'",
    (lote,),
)
print("API query rows:")
for r in cur.fetchall():
    print(" ", r)

cur.execute(
    "SELECT COUNT(*) FROM stock_movements WHERE item_type='produto' AND movement_type='entrada'"
)
print("total produto entradas:", cur.fetchone()[0])

cur.execute(
    "SELECT document_number, COUNT(*) c FROM stock_movements "
    "WHERE item_type='produto' AND movement_type='entrada' "
    "GROUP BY document_number ORDER BY CAST(document_number AS INTEGER) DESC LIMIT 10"
)
print("recent lotes:")
for r in cur.fetchall():
    print(" ", r)

conn.close()
