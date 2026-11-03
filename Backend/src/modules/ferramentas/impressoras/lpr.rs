//! Envio de dados prontos para a impressora: LPR (RFC 1179) para um PC Windows com o Serviço de
//! Impressão LPD, ou TCP cru (porta 9100) para impressora com placa de rede.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

const CONEXAO: Duration = Duration::from_secs(5);
const IO: Duration = Duration::from_secs(20);

/// Aceita `host` ou `host:porta`; devolve `host:porta` com a porta padrão quando faltar.
pub fn com_porta(endereco: &str, padrao: u16) -> String {
    let e = endereco.trim();
    match e.rsplit_once(':') {
        Some((h, p)) if !h.is_empty() && !h.contains(':') && p.parse::<u16>().is_ok() => e.to_string(),
        _ => format!("{e}:{padrao}"),
    }
}

fn conectar(endereco: &str) -> Result<TcpStream, std::io::Error> {
    let mut ultimo = std::io::Error::new(std::io::ErrorKind::NotFound, "endereço não resolvido");
    for a in endereco.to_socket_addrs()? {
        match TcpStream::connect_timeout(&a, CONEXAO) {
            Ok(s) => {
                s.set_read_timeout(Some(IO))?;
                s.set_write_timeout(Some(IO))?;
                let _ = s.set_nodelay(true);
                return Ok(s);
            }
            Err(e) => ultimo = e,
        }
    }
    Err(ultimo)
}

fn so_nome(s: &str) -> String {
    let limpo: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .take(30)
        .collect();
    if limpo.is_empty() { "nexus".into() } else { limpo }
}

fn ack(s: &mut TcpStream, recusa: &str) -> Result<(), String> {
    let mut b = [0u8; 1];
    match s.read_exact(&mut b) {
        Ok(()) if b[0] == 0 => Ok(()),
        Ok(()) => Err(recusa.to_string()),
        Err(e) => Err(format!("O PC não respondeu ao envio da etiqueta: {e}")),
    }
}

fn escrever(s: &mut TcpStream, dados: &[u8]) -> Result<(), String> {
    s.write_all(dados)
        .and_then(|_| s.flush())
        .map_err(|e| format!("Falha ao enviar a etiqueta ao PC: {e}"))
}

/// Envia `dados` (tipo `l`: o Windows passa como RAW, sem driver) para a fila LPD `fila` do PC `host`.
pub fn enviar_lpr(host: &str, fila: &str, dados: &[u8], nome_job: &str) -> Result<(), String> {
    let fila = fila.trim();
    if fila.is_empty() || fila.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("Nome do compartilhamento inválido (sem espaços).".into());
    }
    let endereco = com_porta(host, 515);
    let pc = endereco.rsplit_once(':').map(|x| x.0).unwrap_or(&endereco).to_string();
    let mut s = conectar(&endereco).map_err(|_| {
        format!("Não foi possível conectar ao PC {pc} (porta 515). O PC está ligado e com o compartilhamento LPD ativo?")
    })?;

    let local = so_nome(&std::env::var("HOSTNAME").unwrap_or_default());
    let nnn = uuid::Uuid::new_v4().as_u128() % 1000;
    let job = so_nome(nome_job);

    escrever(&mut s, format!("\x02{fila}\n").as_bytes())?;
    ack(
        &mut s,
        &format!("O PC recusou a fila {fila}: confira o nome do compartilhamento."),
    )?;

    let controle = format!(
        "H{local}\nPnexus\nJ{job}\nldfA{nnn:03}{local}\nUdfA{nnn:03}{local}\nN{job}\n"
    );
    escrever(
        &mut s,
        format!("\x02{} cfA{nnn:03}{local}\n", controle.len()).as_bytes(),
    )?;
    ack(&mut s, "O PC recusou o envio da etiqueta (arquivo de controle).")?;
    let mut c = controle.into_bytes();
    c.push(0);
    escrever(&mut s, &c)?;
    ack(&mut s, "O PC recusou o envio da etiqueta (arquivo de controle).")?;

    escrever(
        &mut s,
        format!("\x03{} dfA{nnn:03}{local}\n", dados.len()).as_bytes(),
    )?;
    ack(&mut s, "O PC recusou a etiqueta (dados).")?;
    let mut d = dados.to_vec();
    d.push(0);
    escrever(&mut s, &d)?;
    ack(&mut s, "O PC recusou a etiqueta (dados).")?;
    Ok(())
}

/// TCP cru; `endereco` = `ip` ou `ip:porta` (padrão 9100).
pub fn enviar_tcp_9100(endereco: &str, dados: &[u8]) -> Result<(), String> {
    let alvo = com_porta(endereco, 9100);
    let mut s = conectar(&alvo)
        .map_err(|_| format!("Não foi possível conectar à impressora em {alvo}. Ela está ligada e na rede?"))?;
    escrever(&mut s, dados)?;
    let _ = s.shutdown(std::net::Shutdown::Write);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn ler_ate(s: &mut TcpStream, fim: u8) -> Vec<u8> {
        let mut v = Vec::new();
        let mut b = [0u8; 1];
        while s.read_exact(&mut b).is_ok() {
            v.push(b[0]);
            if b[0] == fim {
                break;
            }
        }
        v
    }

    fn ler_n(s: &mut TcpStream, n: usize) -> Vec<u8> {
        let mut v = vec![0u8; n];
        s.read_exact(&mut v).unwrap();
        v
    }

    #[test]
    fn porta_padrao() {
        assert_eq!(com_porta("10.0.0.5", 515), "10.0.0.5:515");
        assert_eq!(com_porta("10.0.0.5:9101", 9100), "10.0.0.5:9101");
        assert_eq!(com_porta(" pc-zebra ", 515), "pc-zebra:515");
    }

    #[test]
    fn sequencia_lpr() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = l.local_addr().unwrap().port();
        let th = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let r1 = ler_until_nl(&mut s);
            s.write_all(&[0]).unwrap();
            let r2 = ler_until_nl(&mut s); // \x02{len} cfA...\n
            s.write_all(&[0]).unwrap();
            let tam: usize = String::from_utf8_lossy(&r2[1..])
                .split(' ')
                .next()
                .unwrap()
                .parse()
                .unwrap();
            let ctrl = ler_n(&mut s, tam + 1);
            s.write_all(&[0]).unwrap();
            let r3 = ler_until_nl(&mut s);
            s.write_all(&[0]).unwrap();
            let tam: usize = String::from_utf8_lossy(&r3[1..]).split(' ').next().unwrap().parse().unwrap();
            let dados = ler_n(&mut s, tam + 1);
            s.write_all(&[0]).unwrap();
            (r1, r2, ctrl, r3, dados)
        });

        fn ler_until_nl(s: &mut TcpStream) -> Vec<u8> {
            ler_ate(s, b'\n')
        }

        enviar_lpr(&format!("127.0.0.1:{porta}"), "ZEBRA", b"^XA^XZ", "etiqueta teste").unwrap();
        let (r1, r2, ctrl, r3, dados) = th.join().unwrap();
        assert_eq!(r1, b"\x02ZEBRA\n");
        assert!(r2.starts_with(b"\x02") && String::from_utf8_lossy(&r2).contains(" cfA"));
        let ctrl_txt = String::from_utf8_lossy(&ctrl[..ctrl.len() - 1]).to_string();
        assert_eq!(*ctrl.last().unwrap(), 0);
        assert!(ctrl_txt.contains("\nPnexus\n") && ctrl_txt.contains("\nldfA"));
        assert!(r3.starts_with(b"\x03") && String::from_utf8_lossy(&r3).contains(" dfA"));
        assert_eq!(&dados[..dados.len() - 1], b"^XA^XZ");
        assert_eq!(*dados.last().unwrap(), 0);
    }

    #[test]
    fn fila_recusada() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = l.local_addr().unwrap().port();
        let th = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            ler_ate(&mut s, b'\n');
            s.write_all(&[1]).unwrap();
        });
        let e = enviar_lpr(&format!("127.0.0.1:{porta}"), "NAOEXISTE", b"x", "j").unwrap_err();
        th.join().unwrap();
        assert!(e.contains("recusou a fila NAOEXISTE"), "{e}");
    }

    #[test]
    fn sem_conexao() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = l.local_addr().unwrap().port();
        drop(l);
        let e = enviar_lpr(&format!("127.0.0.1:{porta}"), "Q", b"x", "j").unwrap_err();
        assert!(e.contains("Não foi possível conectar ao PC 127.0.0.1"), "{e}");
    }

    #[test]
    fn tcp_cru() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = l.local_addr().unwrap().port();
        let th = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut v = Vec::new();
            s.read_to_end(&mut v).unwrap();
            v
        });
        enviar_tcp_9100(&format!("127.0.0.1:{porta}"), b"^XA^XZ").unwrap();
        assert_eq!(th.join().unwrap(), b"^XA^XZ");
    }
}
