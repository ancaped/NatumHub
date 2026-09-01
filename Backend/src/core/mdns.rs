//! Lightweight mDNS responder for nexus.local and natumhub.local
//!
//! Listens on 224.0.0.251:5353 UDP multicast and answers A record queries for:
//! - nexus.local
//! - natumhub.local
//!
//! Allows any device in the LAN to access http://nexus.local:3001 dynamically
//! without needing fixed IP configurations.

use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::net::UdpSocket;

static MDNS_RUNNING: AtomicBool = AtomicBool::new(false);

const MDNS_MULTICAST_IPV4: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 251);
const MDNS_PORT: u16 = 5353;

/// Starts the mDNS responder in a background tokio task
pub fn start_mdns_responder(local_ip: Ipv4Addr, port: u16) {
    if MDNS_RUNNING.swap(true, Ordering::SeqCst) {
        // Já está em execução
        return;
    }

    tokio::spawn(async move {
        tracing::info!(
            "Iniciando serviço mDNS para nexus.local e natumhub.local (IP: {}, Porta: {})",
            local_ip,
            port
        );

        if let Err(e) = run_mdns_loop(local_ip, port).await {
            tracing::warn!("mDNS responder encerrado ou indisponível: {}", e);
        }
    });
}

async fn run_mdns_loop(local_ip: Ipv4Addr, _http_port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let bind_addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, MDNS_PORT);

    // No Windows/Linux, configuramos o socket para reutilização de porta e multicast
    let socket = match UdpSocket::bind(bind_addr).await {
        Ok(s) => s,
        Err(e) => {
            tracing::debug!("Não foi possível vincular diretamente em 0.0.0.0:5353 (provavelmente o serviço mDNS do SO já está ativo): {}", e);
            return Ok(());
        }
    };

    let _ = socket.join_multicast_v4(MDNS_MULTICAST_IPV4, Ipv4Addr::UNSPECIFIED);

    let mut buf = [0u8; 1500];

    loop {
        let (len, src) = match socket.recv_from(&mut buf).await {
            Ok(res) => res,
            Err(_) => continue,
        };

        if len < 12 {
            continue;
        }

        let packet = &buf[..len];

        // Verifica se é uma query padrão DNS
        let is_query = (packet[2] & 0x80) == 0;
        if !is_query {
            continue;
        }

        // Verifica se a pergunta busca por 'nexus' ou 'natumhub'
        let contains_nexus = packet_contains_domain(packet, "nexus");
        let contains_natum = packet_contains_domain(packet, "natumhub");

        if contains_nexus || contains_natum {
            let matched_domain = if contains_nexus { "nexus.local" } else { "natumhub.local" };
            let tx_id = u16::from_be_bytes([packet[0], packet[1]]);

            if let Some(resp) = build_dns_a_response(tx_id, matched_domain, local_ip) {
                let target: SocketAddr = SocketAddr::V4(SocketAddrV4::new(MDNS_MULTICAST_IPV4, MDNS_PORT));
                let _ = socket.send_to(&resp, target).await;
                let _ = socket.send_to(&resp, src).await;
            }
        }
    }
}

fn packet_contains_domain(packet: &[u8], name: &str) -> bool {
    let name_bytes = name.as_bytes();
    packet.windows(name_bytes.len()).any(|w| w.eq_ignore_ascii_case(name_bytes))
}

/// Constrói um pacote de resposta DNS A simples com TTL de 120 segundos
fn build_dns_a_response(tx_id: u16, domain: &str, ip: Ipv4Addr) -> Option<Vec<u8>> {
    let mut resp = Vec::with_capacity(128);

    // 1. Header (12 bytes)
    resp.extend_from_slice(&tx_id.to_be_bytes()); // ID
    resp.extend_from_slice(&[0x84, 0x00]); // Flags: Standard response, Authoritative
    resp.extend_from_slice(&[0x00, 0x00]); // QDCOUNT: 0 questions
    resp.extend_from_slice(&[0x00, 0x01]); // ANCOUNT: 1 answer
    resp.extend_from_slice(&[0x00, 0x00]); // NSCOUNT: 0
    resp.extend_from_slice(&[0x00, 0x00]); // ARCOUNT: 0

    // 2. Answer Name (labels: e.g. 5 'nexus' 5 'local' 0)
    for part in domain.split('.') {
        if part.is_empty() || part.len() > 63 {
            return None;
        }
        resp.push(part.len() as u8);
        resp.extend_from_slice(part.as_bytes());
    }
    resp.push(0x00); // Terminating null byte

    // 3. Answer Type (A = 1), Class (IN = 1 | Cache-flush 0x8001), TTL (120s), RDLENGTH (4), RDATA (4 bytes IP)
    resp.extend_from_slice(&[0x00, 0x01]); // TYPE: A
    resp.extend_from_slice(&[0x80, 0x01]); // CLASS: IN (with cache-flush bit)
    resp.extend_from_slice(&[0x00, 0x00, 0x00, 0x78]); // TTL: 120s
    resp.extend_from_slice(&[0x00, 0x04]); // RDLENGTH: 4 bytes
    resp.extend_from_slice(&ip.octets()); // RDATA: IPv4

    Some(resp)
}
