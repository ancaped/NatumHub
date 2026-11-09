"""App "Ligar PC" (roda no Zima de casa, container python:alpine em rede host).

Liga o PC por Wake-on-LAN e, com o agente instalado no PC (agente.py), mostra os recursos,
desliga e configura o desligamento automático. Só biblioteca padrão.

Segredos ficam em arquivos montados em /segredos (nunca no código nem no compose):
  /segredos/pc-token  token do agente do PC
  /segredos/pin       PIN que protege desligar e configurar (sem esse arquivo essas ações ficam bloqueadas)
"""
import hmac
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAC = os.environ.get("WOL_MAC", "74:56:3c:f2:1a:9f")
PORTA = int(os.environ.get("WOL_PORTA", "8099"))
BROADCAST = [b for b in os.environ.get("WOL_BROADCAST", "255.255.255.255,192.168.1.255").split(",") if b]
PC_IPS = [i for i in os.environ.get("PC_IPS", "192.168.1.195,100.89.106.4").split(",") if i]
PC_PORTA = int(os.environ.get("PC_PORTA", "8098"))
ARQ_TOKEN = os.environ.get("PC_TOKEN_ARQ", "/segredos/pc-token")
ARQ_PIN = os.environ.get("PIN_ARQ", "/segredos/pin")
falhas = []  # instantes das tentativas de PIN erradas


def ler(arq):
    try:
        with open(arq) as f:
            return f.read().strip()
    except OSError:
        return ""


def enviar_pacote():
    mac = bytes.fromhex(MAC.replace(":", ""))
    pacote = b"\xff" * 6 + mac * 16
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    for destino in BROADCAST:
        for porta in (7, 9):
            s.sendto(pacote, (destino, porta))
    s.close()


def chamar_agente(metodo, caminho, corpo=None, timeout=4):
    """Fala com o agente do PC, tentando cada IP. Devolve (json, ip) ou (None, None)."""
    token = ler(ARQ_TOKEN)
    if not token:
        return None, None
    for ip in PC_IPS:
        req = urllib.request.Request(f"http://{ip}:{PC_PORTA}{caminho}", method=metodo,
                                     data=None if corpo is None else json.dumps(corpo).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read()), ip
        except (urllib.error.URLError, OSError, ValueError):
            continue
    return None, None


def chamar_controle(metodo, caminho, corpo=None):
    """Fala com o controle do Nexus (controle.py, serviço do próprio Zima em 127.0.0.1:8097)."""
    req = urllib.request.Request(f"http://127.0.0.1:{os.environ.get('CONTROLE_PORTA', '8097')}{caminho}", method=metodo,
                                 data=None if corpo is None else json.dumps(corpo).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, OSError, ValueError):
        return None


def responde_ping():
    for ip in PC_IPS:
        r = subprocess.run(["ping", "-c", "1", "-W", "1", ip], capture_output=True)
        if r.returncode == 0:
            return True
    return False


def pin_valido(informado):
    """Confere o PIN. Bloqueia por 5 minutos após 5 erros seguidos."""
    agora = time.time()
    falhas[:] = [t for t in falhas if agora - t < 300]
    if len(falhas) >= 5:
        return False, "Muitas tentativas. Aguarde alguns minutos."
    pin = ler(ARQ_PIN)
    if not pin:
        return False, "Defina um PIN no Zima: grave-o no arquivo /DATA/AppData/wol/segredos/pin."
    if not hmac.compare_digest(str(informado or ""), pin):
        falhas.append(agora)
        return False, "PIN incorreto."
    return True, ""


PAGINA = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PC de casa</title>
<style>
:root{--bg:#18181b;--card:#27272a;--borda:#3f3f46;--txt:#fafafa;--mut:#a1a1aa;--ok:#4ade80;--warn:#fbbf24;--ruim:#f87171}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--txt);min-height:100dvh}
main{max-width:640px;margin:0 auto;padding:16px;display:grid;gap:12px}
h1{margin:0;font-size:1.25rem;display:flex;gap:10px;align-items:center}
.badge{font-size:.75rem;padding:3px 10px;border-radius:99px;border:1px solid var(--borda);color:var(--mut)}
.badge.on{color:var(--ok);border-color:var(--ok)}.badge.semagente{color:var(--warn);border-color:var(--warn)}
.card{background:var(--card);border:1px solid var(--borda);border-radius:12px;padding:14px;display:grid;gap:10px}
.linha{display:flex;justify-content:space-between;gap:10px;font-size:.9rem}.mut{color:var(--mut)}
.barra{height:8px;background:var(--borda);border-radius:99px;overflow:hidden}.barra>i{display:block;height:100%;background:var(--ok)}
.barra>i.w{background:var(--warn)}.barra>i.r{background:var(--ruim)}
button{font:inherit;min-height:48px;padding:0 18px;border-radius:10px;border:1px solid var(--borda);background:var(--card);color:var(--txt);cursor:pointer}
button.p{background:var(--txt);color:var(--bg);border:0;font-weight:600}button.r{background:var(--ruim);color:#18181b;border:0;font-weight:600}
button:disabled{opacity:.45;cursor:not-allowed}.botoes{display:flex;gap:10px;flex-wrap:wrap}.botoes button{flex:1 1 140px}
input{font:inherit;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--borda);background:var(--bg);color:var(--txt);width:100%}
.msg{min-height:1.2em;font-size:.85rem;color:var(--mut)}.msg.e{color:var(--ruim)}.msg.o{color:var(--ok)}
.aviso{border-color:var(--ruim);color:var(--ruim)}
table{width:100%;border-collapse:collapse;font-size:.85rem}td{padding:3px 0}td:last-child{text-align:right;color:var(--mut)}
dialog{background:var(--card);color:var(--txt);border:1px solid var(--borda);border-radius:14px;max-width:360px;width:calc(100% - 32px)}
dialog::backdrop{background:#000a}
</style></head><body><main>
<div class="card" id="nexusCard">
<div class="linha"><b>Nexus deste servidor</b><span id="nxSituacao" class="badge">...</span></div>
<div class="mut" id="nxDetalhe" style="font-size:.85rem"></div>
<div class="botoes"><button class="p" id="bNxLigar">Ligar Nexus</button><button id="bNxDesligar">Desligar Nexus</button></div>
<div class="linha"><label><input type="checkbox" id="nxAuto" style="width:auto;min-height:0"> desligar sozinho se ninguém usar por</label>
<span><input id="nxMin" type="number" min="5" max="720" style="width:80px"> min</span></div>
<button id="bNxSalvar">Salvar</button><div id="nxMsg" class="msg"></div></div>
<h1>PC de casa <span id="situacao" class="badge">...</span></h1>
<div id="contagem" class="card aviso" hidden></div>
<div class="card"><div class="botoes">
<button class="p" id="bLigar">Ligar PC</button>
<button class="r" id="bDesligar" disabled>Desligar</button>
</div><div id="msg" class="msg"></div></div>

<div id="recursos" class="card" hidden>
<div><div class="linha"><span>CPU</span><span id="cpu"></span></div><div class="barra"><i id="cpuB"></i></div></div>
<div><div class="linha"><span>Memória</span><span id="mem"></span></div><div class="barra"><i id="memB"></i></div></div>
<div><div class="linha"><span>Disco</span><span id="disco"></span></div><div class="barra"><i id="discoB"></i></div></div>
<div class="linha"><span class="mut">Temperaturas</span><span id="temps"></span></div>
<div class="linha"><span class="mut">Ligado há</span><span id="uptime"></span></div>
<div class="linha"><span class="mut">Sem uso (teclado/mouse)</span><span id="ocioso"></span></div>
<table id="top"></table></div>

<div id="autoCard" class="card" hidden>
<div class="linha"><b>Desligar sozinho</b><label><input type="checkbox" id="autoAtivo" style="width:auto;min-height:0"> ativado</label></div>
<div class="mut" style="font-size:.85rem">Desliga o PC depois de <b id="autoMin"></b> min seguidos sem uso, sem compilação e com a CPU baixa. Avisa na tela e dá 2 minutos para cancelar.</div>
<div class="linha"><span>Minutos sem uso</span><input id="autoMinutos" type="number" min="5" max="720" style="width:110px"></div>
<div class="linha"><span class="mut">Calmo há</span><span id="calmo"></span></div>
<button id="bSalvarAuto">Salvar</button></div>
</main>
<dialog id="dlg"><form method="dialog" style="display:grid;gap:12px;padding:6px" id="frm">
<b id="dlgTitulo"></b><div class="mut" id="dlgTexto" style="font-size:.9rem"></div>
<input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">
<div class="botoes"><button type="button" id="dlgNao">Cancelar</button><button class="p" id="dlgSim" value="ok">Confirmar</button></div>
<div id="dlgMsg" class="msg e"></div></form></dialog>
<script>
const $=id=>document.getElementById(id);let ultimo=null,acaoPendente=null;
const fmt=s=>{s=Math.floor(s);const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return (d?d+'d ':'')+(h?h+'h ':'')+m+'min'};
const cor=p=>p>=90?'r':p>=70?'w':'';
function barra(id,p){const e=$(id);e.style.width=Math.min(100,p)+'%';e.className=cor(p)}
function msg(t,tipo){$('msg').textContent=t||'';$('msg').className='msg '+(tipo||'')}
async function api(m,c,corpo){const r=await fetch(c,{method:m,headers:{'Content-Type':'application/json'},body:corpo?JSON.stringify(corpo):undefined});
  let j={};try{j=await r.json()}catch(e){}return {ok:r.ok,j}}
function pintar(d){ultimo=d;const s=$('situacao');
  s.textContent={ligado:'ligado',semagente:'ligado, sem agente',desligado:'desligado'}[d.situacao];
  s.className='badge '+(d.situacao==='ligado'?'on':d.situacao==='semagente'?'semagente':'');
  const a=d.agente;$('recursos').hidden=$('autoCard').hidden=!a;$('bDesligar').disabled=!a;
  const c=$('contagem');if(a&&a.desligando_em_s!=null){c.hidden=false;
    c.innerHTML='Desligando em <b>'+a.desligando_em_s+' s</b> ('+a.motivo_desligamento+') <button id="bCancelar" style="margin-left:8px;min-height:36px">Cancelar</button>';
    $('bCancelar').onclick=async()=>{const r=await api('POST','/api/cancelar');msg(r.ok?'Desligamento cancelado.':'Falha ao cancelar.',r.ok?'o':'e');atualizar()}}else c.hidden=true;
  if(!a)return;
  $('cpu').textContent=a.cpu_media_pct+'% ('+a.nucleos+' núcleos)';barra('cpuB',a.cpu_media_pct);
  $('mem').textContent=(a.memoria.usada_mb/1024).toFixed(1)+' de '+(a.memoria.total_mb/1024).toFixed(1)+' GB';barra('memB',a.memoria.pct);
  $('disco').textContent=a.disco.livre_gb+' GB livres de '+a.disco.total_gb;barra('discoB',a.disco.pct);
  $('temps').textContent=Object.entries(a.temperaturas).map(([k,v])=>k.toUpperCase()+' '+v+'°C').join(' · ')||'—';
  $('uptime').textContent=fmt(a.uptime_s);
  $('ocioso').textContent=a.tela_ociosa_s==null?'sem sessão gráfica':fmt(a.tela_ociosa_s);
  $('top').innerHTML=a.top.map(p=>'<tr><td>'+p.nome+'</td><td>'+p.cpu_pct+'% · '+p.ram_mb+' MB</td></tr>').join('');
  if(document.activeElement!==$('autoMinutos'))$('autoMinutos').value=a.auto.minutos;
  if(document.activeElement!==$('autoAtivo'))$('autoAtivo').checked=a.auto.ativo;
  $('autoMin').textContent=a.auto.minutos;$('calmo').textContent=fmt(a.auto.calmo_ha_s)}
async function atualizar(){try{const r=await api('GET','/api/estado');if(r.ok)pintar(r.j)}catch(e){}}
function pedirPin(titulo,texto,acao){acaoPendente=acao;$('dlgTitulo').textContent=titulo;$('dlgTexto').textContent=texto;$('pin').value='';$('dlgMsg').textContent='';$('dlg').showModal();$('pin').focus()}
$('dlgNao').onclick=()=>$('dlg').close();
$('frm').onsubmit=async e=>{e.preventDefault();const pin=$('pin').value;const r=await acaoPendente(pin);
  if(r.ok){$('dlg').close();msg(r.j.mensagem||'Feito.','o');atualizar()}else $('dlgMsg').textContent=r.j.erro||'Falhou.'};
$('bLigar').onclick=async()=>{const r=await api('POST','/api/ligar');msg(r.ok?'Sinal enviado. O PC leva cerca de 30 segundos para ligar.':'Falha ao enviar o sinal.',r.ok?'o':'e')};
$('bDesligar').onclick=()=>pedirPin('Desligar o PC','O PC desliga em 60 segundos (dá para cancelar aqui).',pin=>api('POST','/api/desligar',{pin,atraso_s:60}));
$('bSalvarAuto').onclick=()=>pedirPin('Salvar desligamento automático','Digite o PIN para confirmar.',pin=>api('POST','/api/auto',{pin,ativo:$('autoAtivo').checked,minutos:parseInt($('autoMinutos').value||'30')}));
const NX={ligado:'ligado',iniciando:'iniciando',ligando:'ligando...',desligando:'desligando...',so_postgres:'só o banco ligado',desligado:'desligado'};
function pintarNx(d){const s=$('nxSituacao');s.textContent=NX[d.situacao]||d.situacao;s.className='badge '+(d.situacao==='ligado'?'on':d.situacao==='desligado'?'':'semagente');
  const t=[];if(d.passo)t.push(d.passo+'...');if(d.erro)t.push('Erro: '+d.erro);
  if(d.situacao==='ligado')t.push(d.conexoes+' conexão(ões) agora'+(d.auto.ativo?' · desliga se ficar '+d.auto.minutos+' min sem uso (parado há '+Math.floor((d.parado_ha_s||0)/60)+' min)':''));
  if(d.situacao==='desligado'&&d.desligou_por_ocio)t.push('Desligou sozinho às '+d.desligou_por_ocio+' por falta de uso.');
  $('nxDetalhe').textContent=t.join(' ');const ocup=['ligando','desligando'].includes(d.situacao);
  $('bNxLigar').disabled=ocup||d.situacao==='ligado';$('bNxDesligar').disabled=ocup||d.situacao==='desligado';
  if(document.activeElement!==$('nxMin'))$('nxMin').value=d.auto.minutos;if(document.activeElement!==$('nxAuto'))$('nxAuto').checked=d.auto.ativo}
async function atualizarNx(){try{const r=await api('GET','/api/nexus/estado');if(r.ok)pintarNx(r.j)}catch(e){}}
function msgNx(t,tipo){$('nxMsg').textContent=t||'';$('nxMsg').className='msg '+(tipo||'')}
$('bNxLigar').onclick=async()=>{const r=await api('POST','/api/nexus/ligar');msgNx(r.ok?'Ligando. Na primeira vez pode levar uns minutos se houver versão nova.':'Falha ao ligar.',r.ok?'o':'e');atualizarNx()};
$('bNxDesligar').onclick=()=>pedirPin('Desligar o Nexus','Desliga o Nexus e o banco deste servidor.',pin=>api('POST','/api/nexus/desligar',{pin}));
$('bNxSalvar').onclick=()=>pedirPin('Salvar desligamento automático do Nexus','Digite o PIN para confirmar.',pin=>api('POST','/api/nexus/auto',{pin,ativo:$('nxAuto').checked,minutos:parseInt($('nxMin').value||'20')}));
atualizar();atualizarNx();setInterval(atualizar,5000);setInterval(atualizarNx,3000);
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "LigarPC"

    def log_message(self, *a):
        pass

    def _enviar(self, codigo, corpo, tipo="application/json; charset=utf-8"):
        dados = corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(dados)

    def _corpo(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(min(n, 4096)) or b"{}")
        except ValueError:
            return {}

    def do_GET(self):
        if self.path == "/saude":
            self._enviar(200, b"ok", "text/plain")
        elif self.path == "/api/estado":
            agente, _ = chamar_agente("GET", "/estado")
            if agente:
                self._enviar(200, {"situacao": "ligado", "agente": agente})
            elif responde_ping():
                self._enviar(200, {"situacao": "semagente", "agente": None})
            else:
                self._enviar(200, {"situacao": "desligado", "agente": None})
        elif self.path == "/api/nexus/estado":
            r = chamar_controle("GET", "/estado")
            self._enviar(200 if r else 502, r or {"erro": "controle do Nexus indisponível"})
        elif self.path in ("/", "/index.html"):
            self._enviar(200, PAGINA.encode(), "text/html; charset=utf-8")
        else:
            self._enviar(404, {"erro": "rota inexistente"})

    def do_POST(self):
        corpo = self._corpo()
        if self.path == "/api/ligar":
            enviar_pacote()
            self._enviar(200, {"ok": True})
        elif self.path == "/api/nexus/ligar":
            r = chamar_controle("POST", "/ligar", {})
            self._enviar(200 if r else 502, r or {"erro": "controle do Nexus indisponível"})
        elif self.path in ("/api/nexus/desligar", "/api/nexus/auto"):
            ok, erro = pin_valido(corpo.get("pin"))
            if not ok:
                self._enviar(403, {"erro": erro})
                return
            if self.path.endswith("desligar"):
                r, msg = chamar_controle("POST", "/desligar", {}), "Desligando o Nexus e o banco."
            else:
                r = chamar_controle("POST", "/auto", {k: corpo[k] for k in ("ativo", "minutos") if k in corpo})
                msg = "Desligamento automático salvo."
            self._enviar(200 if r else 502, {**r, "mensagem": msg} if r else {"erro": "controle do Nexus indisponível"})
        elif self.path == "/api/cancelar":
            r, _ = chamar_agente("POST", "/cancelar", {})
            self._enviar(200 if r else 502, r or {"erro": "agente do PC indisponível"})
        elif self.path in ("/api/desligar", "/api/auto"):
            ok, erro = pin_valido(corpo.get("pin"))
            if not ok:
                self._enviar(403, {"erro": erro})
                return
            if self.path == "/api/desligar":
                r, _ = chamar_agente("POST", "/desligar", {"atraso_s": int(corpo.get("atraso_s", 60))})
                msg = "O PC vai desligar em instantes."
            else:
                r, _ = chamar_agente("POST", "/auto", {k: corpo[k] for k in ("ativo", "minutos", "cpu_max_pct") if k in corpo})
                msg = "Desligamento automático salvo."
            self._enviar(200 if r else 502, {**r, "mensagem": msg} if r else {"erro": "agente do PC indisponível"})
        else:
            self._enviar(404, {"erro": "rota inexistente"})


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORTA), Handler).serve_forever()
