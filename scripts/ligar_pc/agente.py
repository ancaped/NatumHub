#!/usr/bin/env python3
"""Agente do PC de casa: mede o uso de recursos e desliga o PC quando o app "Ligar PC" (no Zima) pede.

Roda como serviço de USUÁRIO (systemd --user), sem sudo. Só biblioteca padrão.
- GET  /estado      recursos, ociosidade e situação do desligamento automático
- POST /desligar    {"atraso_s": 60}      agenda o desligamento (cancelável)
- POST /cancelar                          cancela um desligamento agendado
- POST /auto        {"ativo": true, "minutos": 30, "cpu_max_pct": 15}   desligamento automático
Toda rota exige "Authorization: Bearer <token>" e vem de um IP da lista permitida.
Com NEXUS_PC_SIMULAR=1 ele nunca desliga de verdade (só registra), para testes.
"""
import ctypes
import ctypes.util
import hmac
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PASTA = os.path.join(os.path.expanduser("~"), ".config", "nexus-pc-agente")
ARQ_TOKEN = os.path.join(PASTA, "token")
ARQ_CONFIG = os.path.join(PASTA, "config.json")
PORTA = int(os.environ.get("NEXUS_PC_PORTA", "8098"))
SIMULAR = os.environ.get("NEXUS_PC_SIMULAR") == "1"
PADRAO = {
    "ativo": False,            # desligamento automático (começa DESLIGADO)
    "minutos": 30,             # tempo seguido de calmaria antes de iniciar a contagem
    "cpu_max_pct": 15,         # acima disso o PC está "trabalhando"
    "aviso_s": 120,            # contagem regressiva (com notificação) antes de desligar
    "ips_permitidos": ["127.0.0.1", "192.168.1.105", "100.64.207.54"],
}
# Programas que indicam trabalho em andamento (compilação etc.), mesmo com a CPU baixa por instantes.
PROCESSOS_DE_TRABALHO = {"cargo", "rustc", "cc1", "cc1plus", "ld", "lld", "npm", "tsc", "vite", "rsync"}

trava = threading.Lock()
estado = {
    "cpu_pct": 0.0, "cpu_media_pct": 0.0, "top": [], "calmo_desde": None,
    "desligar_em": None, "motivo": "", "ultimo_aviso": "",
}
cpu_amostras = []


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def carregar_config():
    cfg = dict(PADRAO)
    try:
        with open(ARQ_CONFIG) as f:
            cfg.update(json.load(f))
    except (OSError, ValueError):
        pass
    return cfg


def salvar_config(cfg):
    os.makedirs(PASTA, mode=0o700, exist_ok=True)
    tmp = ARQ_CONFIG + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, ARQ_CONFIG)


def carregar_token():
    os.makedirs(PASTA, mode=0o700, exist_ok=True)
    if not os.path.exists(ARQ_TOKEN):
        fd = os.open(ARQ_TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(os.urandom(24).hex())
        log("token novo gerado em " + ARQ_TOKEN)
    with open(ARQ_TOKEN) as f:
        return f.read().strip()


# ----------------------------------------------------------------------------- medições
def ler_cpu():
    with open("/proc/stat") as f:
        v = [int(x) for x in f.readline().split()[1:]]
    ocioso = v[3] + v[4]
    return sum(v), ocioso


def ler_processos():
    """pid -> (nome, ticks de CPU, rss em KB)."""
    saida = {}
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/stat") as f:
                dados = f.read()
            nome = dados[dados.index("(") + 1:dados.rindex(")")]
            resto = dados[dados.rindex(")") + 2:].split()
            ticks = int(resto[11]) + int(resto[12])
            rss = int(resto[21]) * (os.sysconf("SC_PAGE_SIZE") // 1024)
            saida[int(pid)] = (nome, ticks, rss)
        except (OSError, ValueError, IndexError):
            continue
    return saida


def ambiente_grafico():
    """DISPLAY/XAUTHORITY da sessão gráfica, lidos do processo do desktop (Cinnamon)."""
    uid = os.getuid()
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            if os.stat(f"/proc/{pid}").st_uid != uid:
                continue
            with open(f"/proc/{pid}/comm") as f:
                if f.read().strip() not in ("cinnamon", "cinnamon-session"):
                    continue
            with open(f"/proc/{pid}/environ", "rb") as f:
                env = dict(p.split(b"=", 1) for p in f.read().split(b"\0") if b"=" in p)
            if b"DISPLAY" in env:
                return env[b"DISPLAY"].decode(), env.get(b"XAUTHORITY", b"").decode()
        except (OSError, ValueError):
            continue
    return None, None


def ocioso_tela_s():
    """Segundos sem teclado/mouse (X11, libXss). None se não há sessão gráfica."""
    display, xauth = ambiente_grafico()
    if not display:
        return None
    try:
        if xauth:
            os.environ["XAUTHORITY"] = xauth
        x11 = ctypes.cdll.LoadLibrary(ctypes.util.find_library("X11") or "libX11.so.6")
        xss = ctypes.cdll.LoadLibrary(ctypes.util.find_library("Xss") or "libXss.so.1")

        class Info(ctypes.Structure):
            _fields_ = [("window", ctypes.c_ulong), ("state", ctypes.c_int), ("kind", ctypes.c_int),
                        ("til_or_since", ctypes.c_ulong), ("idle", ctypes.c_ulong), ("mask", ctypes.c_ulong)]

        x11.XOpenDisplay.restype = ctypes.c_void_p
        x11.XDefaultRootWindow.restype = ctypes.c_ulong
        xss.XScreenSaverAllocInfo.restype = ctypes.POINTER(Info)
        d = x11.XOpenDisplay(display.encode())
        if not d:
            return None
        info = xss.XScreenSaverAllocInfo()
        xss.XScreenSaverQueryInfo(ctypes.c_void_p(d), ctypes.c_ulong(x11.XDefaultRootWindow(ctypes.c_void_p(d))), info)
        ocioso = info.contents.idle / 1000.0
        x11.XCloseDisplay(ctypes.c_void_p(d))
        return ocioso
    except Exception:  # noqa: BLE001 - qualquer falha de X = "não sei", nunca derruba o agente
        return None


def memoria():
    m = {}
    with open("/proc/meminfo") as f:
        for linha in f:
            k, v = linha.split(":")
            m[k] = int(v.split()[0])
    total, disp = m["MemTotal"], m["MemAvailable"]
    return {"total_mb": total // 1024, "usada_mb": (total - disp) // 1024,
            "pct": round((total - disp) * 100 / total, 1)}


def temperaturas():
    saida = {}
    base = "/sys/class/hwmon"
    for h in sorted(os.listdir(base)):
        try:
            with open(f"{base}/{h}/name") as f:
                nome = f.read().strip()
            rotulo = {"k10temp": "cpu", "amdgpu": "gpu", "nvme": "nvme"}.get(nome)
            if not rotulo or rotulo in saida:
                continue
            with open(f"{base}/{h}/temp1_input") as f:
                saida[rotulo] = round(int(f.read()) / 1000, 1)
        except (OSError, ValueError):
            continue
    return saida


def sessoes_remotas():
    try:
        sessoes = subprocess.run(["loginctl", "list-sessions", "--no-legend"], capture_output=True,
                                 text=True, timeout=5).stdout.split("\n")
        n = 0
        for linha in sessoes:
            partes = linha.split()
            if not partes:
                continue
            r = subprocess.run(["loginctl", "show-session", partes[0], "-p", "Remote", "--value"],
                               capture_output=True, text=True, timeout=5).stdout.strip()
            n += r == "yes"
        return n
    except (OSError, subprocess.SubprocessError):
        return 0


def avisar(titulo, texto):
    try:
        subprocess.run(["notify-send", "-u", "critical", "-a", "Nexus", titulo, texto], timeout=5)
    except (OSError, subprocess.SubprocessError):
        pass


# ----------------------------------------------------------------------------- amostrador
def amostrador():
    """A cada 5 s: CPU, processos que mais usam, e se o PC está 'calmo' (candidato ao desligamento)."""
    ant_total, ant_ocioso = ler_cpu()
    ant_proc = ler_processos()
    while True:
        time.sleep(5)
        try:
            cfg = carregar_config()
            total, ocioso = ler_cpu()
            d_total, d_ocioso = total - ant_total, ocioso - ant_ocioso
            cpu = round(100 * (1 - d_ocioso / d_total), 1) if d_total > 0 else 0.0
            ant_total, ant_ocioso = total, ocioso
            proc = ler_processos()
            hz = os.sysconf("SC_CLK_TCK")
            top = []
            for pid, (nome, ticks, rss) in proc.items():
                if pid in ant_proc:
                    pct = round((ticks - ant_proc[pid][1]) * 100 / hz / 5, 1)
                    top.append({"nome": nome, "cpu_pct": pct, "ram_mb": rss // 1024})
            ant_proc = proc
            top.sort(key=lambda p: (p["cpu_pct"], p["ram_mb"]), reverse=True)
            nomes = {p[0] for p in proc.values()}
            trabalhando = bool(nomes & PROCESSOS_DE_TRABALHO)
            with trava:
                cpu_amostras.append(cpu)
                del cpu_amostras[:-12]  # ~1 minuto
                media = round(sum(cpu_amostras) / len(cpu_amostras), 1)
                estado.update(cpu_pct=cpu, cpu_media_pct=media, top=top[:5], trabalhando=trabalhando)
            tela = ocioso_tela_s()
            calmo = (media <= cfg["cpu_max_pct"] and not trabalhando and sessoes_remotas() == 0
                     and (tela is None or tela >= 60))
            with trava:
                if calmo:
                    estado["calmo_desde"] = estado["calmo_desde"] or time.time()
                else:
                    estado["calmo_desde"] = None
            verificar_auto(cfg)
        except Exception as e:  # noqa: BLE001
            log(f"amostrador: {e}")


def verificar_auto(cfg):
    agora = time.time()
    with trava:
        desde, desligar_em, motivo = estado["calmo_desde"], estado["desligar_em"], estado["motivo"]
    if desligar_em is None:
        if cfg["ativo"] and desde and agora - desde >= cfg["minutos"] * 60:
            agendar(cfg["aviso_s"], "automático: PC sem uso")
        return
    # Contagem do automático: se o PC voltou a ser usado, cancela sozinha.
    if motivo.startswith("automático") and (not cfg["ativo"] or desde is None):
        cancelar("PC voltou a ser usado" if cfg["ativo"] else "desligamento automático desativado")
        return
    if agora >= desligar_em:
        executar_desligamento()


def agendar(atraso_s, motivo):
    with trava:
        estado["desligar_em"] = time.time() + atraso_s
        estado["motivo"] = motivo
    log(f"desligamento agendado em {atraso_s}s ({motivo})")
    avisar("Nexus: o PC vai desligar", f"Desligando em {atraso_s} s ({motivo}). Mexa no mouse ou cancele pelo Ligar PC.")


def cancelar(porque):
    with trava:
        estava = estado["desligar_em"] is not None
        estado["desligar_em"] = None
        estado["motivo"] = ""
    if estava:
        log(f"desligamento cancelado: {porque}")
        avisar("Nexus: desligamento cancelado", porque)
    return estava


def executar_desligamento():
    with trava:
        estado["desligar_em"] = None
    if SIMULAR:
        log("SIMULAÇÃO: o PC seria desligado agora")
        return
    log("desligando o PC")
    r = subprocess.run(["systemctl", "poweroff"], capture_output=True, text=True)
    if r.returncode != 0:
        log("falha ao desligar: " + (r.stderr or r.stdout).strip())


# ----------------------------------------------------------------------------- HTTP
def montar_estado():
    cfg = carregar_config()
    with trava:
        e = dict(estado)
    uso = shutil.disk_usage("/")
    tela = ocioso_tela_s()
    with open("/proc/uptime") as f:
        uptime = int(float(f.read().split()[0]))
    calmo_s = int(time.time() - e["calmo_desde"]) if e.get("calmo_desde") else 0
    return {
        "ligado": True, "simulacao": SIMULAR, "uptime_s": uptime, "carga": os.getloadavg(),
        "cpu_pct": e["cpu_pct"], "cpu_media_pct": e["cpu_media_pct"], "nucleos": os.cpu_count(),
        "memoria": memoria(), "disco": {"total_gb": round(uso.total / 1e9), "livre_gb": round(uso.free / 1e9),
                                        "pct": round(uso.used * 100 / uso.total, 1)},
        "temperaturas": temperaturas(), "top": e["top"], "trabalhando": e.get("trabalhando", False),
        "tela_ociosa_s": None if tela is None else int(tela), "sessao_grafica": tela is not None,
        "auto": {"ativo": cfg["ativo"], "minutos": cfg["minutos"], "cpu_max_pct": cfg["cpu_max_pct"],
                 "calmo_ha_s": calmo_s},
        "desligando_em_s": None if e["desligar_em"] is None else max(0, int(e["desligar_em"] - time.time())),
        "motivo_desligamento": e["motivo"],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "NexusPcAgente"

    def log_message(self, *a):  # silencia o log por requisição
        pass

    def _json(self, codigo, obj):
        corpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _autorizado(self):
        if self.client_address[0] not in carregar_config()["ips_permitidos"]:
            self._json(403, {"erro": "origem não permitida"})
            return False
        enviado = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(enviado, TOKEN):
            self._json(401, {"erro": "token inválido"})
            return False
        return True

    def _corpo(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(min(n, 4096)) or b"{}")
        except ValueError:
            return {}

    def do_GET(self):
        if not self._autorizado():
            return
        if self.path == "/estado":
            self._json(200, montar_estado())
        else:
            self._json(404, {"erro": "rota inexistente"})

    def do_POST(self):
        if not self._autorizado():
            return
        corpo = self._corpo()
        if self.path == "/desligar":
            atraso = max(5, min(int(corpo.get("atraso_s", 60)), 3600))
            agendar(atraso, "pedido manual")
            self._json(200, {"ok": True, "desligando_em_s": atraso, "simulacao": SIMULAR})
        elif self.path == "/cancelar":
            self._json(200, {"ok": True, "tinha_agendamento": cancelar("cancelado pelo Ligar PC")})
        elif self.path == "/auto":
            cfg = carregar_config()
            if "ativo" in corpo:
                cfg["ativo"] = bool(corpo["ativo"])
            if "minutos" in corpo:
                cfg["minutos"] = max(5, min(int(corpo["minutos"]), 720))
            if "cpu_max_pct" in corpo:
                cfg["cpu_max_pct"] = max(1, min(int(corpo["cpu_max_pct"]), 90))
            salvar_config(cfg)
            log(f"desligamento automático: ativo={cfg['ativo']} minutos={cfg['minutos']} cpu_max={cfg['cpu_max_pct']}")
            self._json(200, {"ok": True, "auto": {k: cfg[k] for k in ("ativo", "minutos", "cpu_max_pct")}})
        else:
            self._json(404, {"erro": "rota inexistente"})


if __name__ == "__main__":
    TOKEN = carregar_token()
    if not os.path.exists(ARQ_CONFIG):
        salvar_config(PADRAO)
    threading.Thread(target=amostrador, daemon=True).start()
    log(f"agente do PC na porta {PORTA}" + (" [SIMULAÇÃO: não desliga de verdade]" if SIMULAR else ""))
    try:
        ThreadingHTTPServer(("0.0.0.0", PORTA), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
