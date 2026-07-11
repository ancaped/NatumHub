#!/usr/bin/env python3
"""Fix misplaced API_BASE imports and broken string literals after bulk replace."""
import re
from pathlib import Path

ROOT = Path(r"C:\api\Frontend\src")


def move_trailing_import(text: str) -> str:
    m = re.search(
        r"\n(import \{ API_BASE(?:, API_ORIGIN)? \} from ['\"][^'\"]+['\"];)\s*$",
        text,
    )
    if not m:
        return text
    imp = m.group(1)
    body = text[: m.start()]
    if imp in body:
        return body.rstrip() + "\n"
    lines = body.splitlines()
    last = -1
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last = i
    if last >= 0:
        lines.insert(last + 1, imp)
    else:
        lines.insert(0, imp)
    return "\n".join(lines).rstrip() + "\n"


def fix_quoted_placeholders(text: str) -> str:
    # '`${API_BASE}/path`'  or  '${API_BASE}/path'  ->  `${API_BASE}/path`
    text = re.sub(
        r"'(\$\{API_BASE\}[^']*)'",
        lambda m: "`" + m.group(1) + "`",
        text,
    )
    text = re.sub(
        r"'(\$\{API_ORIGIN\}[^']*)'",
        lambda m: "`" + m.group(1) + "`",
        text,
    )
    return text


def main() -> None:
    for p in ROOT.rglob("*"):
        if p.suffix not in {".ts", ".tsx", ".jsx", ".js"}:
            continue
        if "node_modules" in str(p):
            continue
        orig = p.read_text(encoding="utf-8")
        text = move_trailing_import(orig)
        text = fix_quoted_placeholders(text)
        if text != orig:
            p.write_text(text, encoding="utf-8")
            print(f"fixed {p}")

    # firebase: ensure import
    fb = ROOT / "modules/geral/acesso/firebase.ts"
    t = fb.read_text(encoding="utf-8")
    if "lib/http" not in t:
        t = t.replace(
            "from 'firebase/auth';",
            "from 'firebase/auth';\nimport { API_BASE, API_ORIGIN } from '../lib/http';",
        )
    t = fix_quoted_placeholders(t)
    fb.write_text(t.rstrip() + "\n", encoding="utf-8")
    print("firebase ok")

    # ProducaoView import if needed
    pv = ROOT / "modules/producao/gerenciamento/ProducaoView.jsx"
    t = pv.read_text(encoding="utf-8")
    if "API_BASE" in t and "lib/http" not in t:
        t = t.replace(
            "import AppLayout from '../../geral/components/layout/AppLayout';",
            "import AppLayout from '../../geral/components/layout/AppLayout';\n"
            "import { API_BASE } from '../../geral/lib/http';",
        )
        pv.write_text(t, encoding="utf-8")
        print("producao import ok")

    # MontagemKits, AprovacaoTab, BasesTab, HistoryTab, etc.
    needs = [
        (
            ROOT / "modules/producao/montagem_kits/MontagemKitsView.jsx",
            "import { API_BASE } from '../../geral/lib/http';",
        ),
        (
            ROOT / "modules/producao/gerenciamento/components/AprovacaoTab.jsx",
            "import { API_BASE } from '../../../geral/lib/http';",
        ),
        (
            ROOT / "modules/producao/gerenciamento/components/BasesTab.jsx",
            "import { API_BASE } from '../../../geral/lib/http';",
        ),
        (
            ROOT / "modules/producao/gerenciamento/components/HistoryTab.jsx",
            "import { API_BASE } from '../../../geral/lib/http';",
        ),
    ]
    for path, imp in needs:
        if not path.exists():
            continue
        t = path.read_text(encoding="utf-8")
        if "API_BASE" in t and "lib/http" not in t:
            # insert after first import block
            lines = t.splitlines()
            last = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    last = i
            lines.insert(last + 1, imp)
            path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
            print(f"import added {path.name}")

    print("DONE")


if __name__ == "__main__":
    main()
