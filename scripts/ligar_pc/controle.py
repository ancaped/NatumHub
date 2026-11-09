#!/usr/bin/env python3
"""Controle do Nexus no Zima de casa (servidor de TESTE: prioridade é desempenho, não ficar ligado).

Roda como serviço systemd (root) e escuta só em 127.0.0.1:8097; quem fala com ele é o app "Ligar PC".
- Ligar:    sobe o Postgres, espera ficar saudável, roda o autodeploy (puxa a versão mais nova da main, se
            houver) e sobe o Nexus. Ligar o Nexus sempre liga o Postgres antes.
- Desligar: para o Nexus e depois o Postgres.
- Automático: se ninguém estiver conectado ao Nexus por N minutos, desliga os dois.
"Em uso" = conexões estabelecidas na porta 3001 vindas de fora (navegadores, agentes). Conexões do próprio
servidor (127.0.0.1 e a ponte do Docker 172.17.0.1, usadas por health check e autodeploy) não contam.
Só biblioteca padrão. Não grava nada em produção: só liga e desliga containers.
"""
import json
import os
import subprocess
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DOCKER = "/usr/bin/docker"
NEXUS = "nexus-prod"
POSTGRES = "nexus-postgres-prod"
ARQ_CONFIG = os.environ.get("CONTROLE_CONFIG", "/DATA/AppData/wol/controle.json")
PORTA = int(os.environ.get("CONTROLE_PORTA", "8097"))
HEALTH = "http://127.0.0.1:3001/api/health"
PADRAO = {"auto_ativo": True, "minutos": 20}
IGNORAR = {"0100007F", "010011AC"}  # 127.0.0.1 e 172.17.0.1 (ordem de bytes do /proc/net/tcp)

trava = threading.Lock()
estado = {"operacao": None, "passo": "", "erro": "", "ultimo_uso": time.time(), "desligou_por_ocio": None}


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def config():
    cfg = dict(PADRAO)
    try:
        with open(ARQ_CONFIG) as f:
            cfg.update(json.load(f))
    except (OSError, ValueError):
        pass
    return cfg


def salvar(cfg):
    os.makedirs(os.path.dirname(ARQ_CONFIG), exist_ok=True)
    tmp = ARQ_CONFIG + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, ARQ_CONFIG)


def docker(*args, timeout=120):
    return subprocess.run([DOCKER, *args], capture_output=True, text=True, timeout=timeout)


def info(nome):
    """('running'|'exited'|'ausente', 'healthy'|'starting'|'unhealthy'|'', pid)."""
    r = docker("inspect", "-f", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.Pid}}", nome)
    if r.returncode != 0:
        return "ausente", "", 0
    st, saude, pid = (r.stdout.strip().split("|") + ["", "", "0"])[:3]
    return st, saude, int(pid or 0)


def saudavel_http():
    try:
        with urllib.request.urlopen(HEALTH, timeout=4) as r:
            return b'"status":"ok"' in r.read().replace(b" ", b"")
    except Exception:  # noqa: BLE001
        return False


def conexoes():
    """Conexões externas estabelecidas na porta 3001 do container do Nexus."""
    st, _, pid = info(NEXUS)
    if st != "running" or not pid:
        return 0
    n = 0
    try:
        with open(f"/proc/{pid}/net/tcp") as f:
            next(f)
            for linha in f:
                p = linha.split()
                local, remoto, situacao = p[1], p[2], p[3]
                if situacao == "01" and local.endswith(":0BB9") and remoto.split(":")[0] not in IGNORAR:
                    n += 1
    except OSError:
        return 0
    return n


def situacao():
    n_st, _, _ = info(NEXUS)
    p_st, p_saude, _ = info(POSTGRES)
    with trava:
        op = estado["operacao"]
    if op:
        return op
    if n_st == "running" and saudavel_http():
        return "ligado"
    if n_st == "running":
        return "iniciando"
    if p_st == "running":
        return "so_postgres"
    return "desligado"


def esperar(condicao, limite_s, passo):
    with trava:
        estado["passo"] = passo
    fim = time.time() + limite_s
    while time.time() < fim:
        if condicao():
            return True
        time.sleep(2)
    return False


def _ligar():
    try:
        with trava:
            estado["erro"] = ""
        if info(POSTGRES)[0] != "running":
            with trava:
                estado["passo"] = "Ligando o Postgres"
            docker("start", POSTGRES)
        if not esperar(lambda: info(POSTGRES)[1] == "healthy", 90, "Esperando o Postgres ficar pronto"):
            raise RuntimeError("o Postgres não ficou saudável em 90 s")
        with trava:
            estado["passo"] = "Verificando se há versão nova do Nexus"
        subprocess.run(["systemctl", "start", "nexus-autodeploy.service"], timeout=1500)  # no-op se já atualizado
        if info(NEXUS)[0] != "running":
            with trava:
                estado["passo"] = "Ligando o Nexus"
            docker("start", NEXUS)
        if not esperar(saudavel_http, 120, "Esperando o Nexus responder"):
            raise RuntimeError("o Nexus não respondeu em 120 s")
        with trava:
            estado["ultimo_uso"] = time.time()
            estado["desligou_por_ocio"] = None
        log("Nexus ligado")
    except Exception as e:  # noqa: BLE001
        log(f"falha ao ligar: {e}")
        with trava:
            estado["erro"] = str(e)
    finally:
        with trava:
            estado["operacao"] = None
            estado["passo"] = ""


def _desligar(motivo):
    try:
        with trava:
            estado["passo"] = "Desligando o Nexus"
        docker("stop", "-t", "30", NEXUS, timeout=60)
        with trava:
            estado["passo"] = "Desligando o Postgres"
        docker("stop", "-t", "60", POSTGRES, timeout=90)
        log(f"Nexus e Postgres desligados ({motivo})")
    except Exception as e:  # noqa: BLE001
        log(f"falha ao desligar: {e}")
        with trava:
            estado["erro"] = str(e)
    finally:
        with trava:
            estado["operacao"] = None
            estado["passo"] = ""


def iniciar(operacao, alvo, *args):
    with trava:
        if estado["operacao"]:
            return False
        estado["operacao"] = operacao
    threading.Thread(target=alvo, args=args, daemon=True).start()
    return True


def vigia():
    """A cada minuto: com o Nexus ligado e o automático ativo, desliga depois de N minutos sem ninguém conectado."""
    while True:
        time.sleep(60)
        try:
            cfg = config()
            with trava:
                ocupado = estado["operacao"] is not None
            if ocupado or info(NEXUS)[0] != "running":
                continue
            if conexoes() > 0:
                with trava:
                    estado["ultimo_uso"] = time.time()
                continue
            with trava:
                parado_s = time.time() - estado["ultimo_uso"]
            if cfg["auto_ativo"] and parado_s >= cfg["minutos"] * 60:
                with trava:
                    estado["desligou_por_ocio"] = time.strftime("%H:%M")
                iniciar("desligando", _desligar, f"ninguém usou por {int(parado_s // 60)} min")
        except Exception as e:  # noqa: BLE001
            log(f"vigia: {e}")


class Handler(BaseHTTPRequestHandler):
    server_version = "NexusControle"

    def log_message(self, *a):
        pass

    def _json(self, codigo, obj):
        corpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _corpo(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(min(n, 2048)) or b"{}")
        except ValueError:
            return {}

    def do_GET(self):
        if self.path != "/estado":
            return self._json(404, {"erro": "rota inexistente"})
        cfg = config()
        with trava:
            e = dict(estado)
        n = conexoes()
        rodando = info(NEXUS)[0] == "running"
        self._json(200, {
            "situacao": situacao(), "passo": e["passo"], "erro": e["erro"],
            "postgres": info(POSTGRES)[0], "conexoes": n,
            "parado_ha_s": (0 if n > 0 else int(time.time() - e["ultimo_uso"])) if rodando else None,
            "auto": {"ativo": cfg["auto_ativo"], "minutos": cfg["minutos"]},
            "desligou_por_ocio": e["desligou_por_ocio"],
        })

    def do_POST(self):
        corpo = self._corpo()
        if self.path == "/ligar":
            self._json(200, {"ok": iniciar("ligando", _ligar)})
        elif self.path == "/desligar":
            self._json(200, {"ok": iniciar("desligando", _desligar, "pedido manual")})
        elif self.path == "/auto":
            cfg = config()
            if "ativo" in corpo:
                cfg["auto_ativo"] = bool(corpo["ativo"])
            if "minutos" in corpo:
                cfg["minutos"] = max(5, min(int(corpo["minutos"]), 720))
            salvar(cfg)
            self._json(200, {"ok": True, "auto": {"ativo": cfg["auto_ativo"], "minutos": cfg["minutos"]}})
        else:
            self._json(404, {"erro": "rota inexistente"})


if __name__ == "__main__":
    threading.Thread(target=vigia, daemon=True).start()
    log(f"controle do Nexus em 127.0.0.1:{PORTA}")
    ThreadingHTTPServer(("127.0.0.1", PORTA), Handler).serve_forever()
