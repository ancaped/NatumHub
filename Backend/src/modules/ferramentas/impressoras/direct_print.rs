use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct DirectPrintRequest {
    /// Impressora cadastrada em Impressoras; sem ela, procura pelo `printer_name`.
    #[serde(default)]
    pub printer_id: Option<String>,
    #[serde(default)]
    pub printer_name: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub copies: u32,
    pub landscape: bool,
    pub fill_scale: f64,
    /// Ajuste lateral em mm (positivo desloca a arte para a direita). Corrige impressora que corta a borda esquerda.
    #[serde(default)]
    pub offset_x_mm: f64,
    #[serde(default)]
    pub pages_png_base64: Vec<String>,
    /// Etiquetas com texto e códigos de barras nativos (ZPL/EPL). Quando presente, vale no lugar das imagens.
    #[serde(default)]
    pub paginas_nativas: Vec<super::nativo::PaginaNativa>,
}

const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$printer = $env:NEXUS_PRINTER
if ([string]::IsNullOrWhiteSpace($printer)) { throw 'Impressora nao informada.' }
$dir = $env:NEXUS_DIR
$widthMm = [single]$env:NEXUS_WIDTH_MM
$heightMm = [single]$env:NEXUS_HEIGHT_MM
$copies = [Math]::Max(1, [int]$env:NEXUS_COPIES)
$landscape = $env:NEXUS_LANDSCAPE -eq '1'
$fill = [single]$env:NEXUS_FILL
if ($fill -lt 0.85 -or $fill -gt 1.2) { $fill = [single]1 }
$offsetX = [single]0
if ($env:NEXUS_OFFSET_X) { $offsetX = [single]::Parse($env:NEXUS_OFFSET_X, [Globalization.CultureInfo]::InvariantCulture) }

$files = @(Get-ChildItem -LiteralPath $dir -Filter '*.png' | Sort-Object Name)
if ($files.Count -eq 0) { throw 'Nenhuma imagem de etiqueta.' }

function Read-LabelBytes([string]$path) {
  for ($try = 1; $try -le 8; $try++) {
    $stream = $null
    try {
      $stream = New-Object System.IO.FileStream(
        $path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
      )
      $buffer = New-Object byte[] $stream.Length
      [void]$stream.Read($buffer, 0, $buffer.Length)
      return $buffer
    } catch {
      if ($try -ge 8) { throw }
      Start-Sleep -Milliseconds (150 * $try)
    } finally {
      if ($stream) { $stream.Dispose() }
    }
  }
}

function New-LabelDocument {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $printer
  if (-not $doc.PrinterSettings.IsValid) {
    $doc.Dispose()
    throw "Impressora nao encontrada no Windows: $printer"
  }
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.PrinterSettings.Copies = 1
  $wHi = [int][Math]::Round(($widthMm / 25.4) * 100)
  $hHi = [int][Math]::Round(($heightMm / 25.4) * 100)
  $paper = New-Object System.Drawing.Printing.PaperSize('NexusEtiqueta', $wHi, $hHi)
  $margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.DefaultPageSettings.PaperSize = $paper
  $doc.DefaultPageSettings.Margins = $margins
  $doc.DefaultPageSettings.Landscape = [bool]$landscape
  $doc.PrinterSettings.DefaultPageSettings.PaperSize = $paper
  $doc.PrinterSettings.DefaultPageSettings.Margins = $margins
  $doc.PrinterSettings.DefaultPageSettings.Landscape = [bool]$landscape
  $doc.OriginAtMargins = $false
  $doc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Millimeter
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $drawW = $global:NexusPrintW * $global:NexusPrintFill
    $drawH = $global:NexusPrintH * $global:NexusPrintFill
    $ox = (($global:NexusPrintW - $drawW) / 2.0) + $global:NexusPrintOffsetX
    $oy = ($global:NexusPrintH - $drawH) / 2.0
    $rect = New-Object System.Drawing.RectangleF([single]$ox, [single]$oy, [single]$drawW, [single]$drawH)
    $e.Graphics.DrawImage($global:NexusPrintImg, $rect)
    $e.HasMorePages = $false
  })
  return $doc
}

function Invoke-LabelPrint([string]$path) {
  $bytes = Read-LabelBytes $path
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $loaded = [System.Drawing.Image]::FromStream($ms)
  $img = New-Object System.Drawing.Bitmap($loaded)
  $loaded.Dispose()
  $ms.Dispose()
  $global:NexusPrintImg = $img
  $global:NexusPrintW = $widthMm
  $global:NexusPrintH = $heightMm
  $global:NexusPrintFill = $fill
  $global:NexusPrintOffsetX = $offsetX
  try {
    for ($i = 0; $i -lt $copies; $i++) {
      $printed = $false
      for ($try = 1; $try -le 6 -and -not $printed; $try++) {
        $doc = New-LabelDocument
        try {
          $doc.Print()
          $printed = $true
        } catch {
          $msg = [string]$_.Exception.Message
          $busy = $msg -match 'acesso o arquivo|being used by another process|utilizado por outro processo'
          if (-not $busy -or $try -ge 6) {
            if ($busy) { throw 'A impressora ainda está com a etiqueta anterior aberta. Aguarde alguns segundos e tente de novo.' }
            throw
          }
          Start-Sleep -Milliseconds (300 * $try)
        } finally {
          $doc.Dispose()
        }
      }
      if ($i -lt ($copies - 1)) { Start-Sleep -Milliseconds 250 }
    }
  } finally {
    $img.Dispose()
  }
}

foreach ($file in $files) {
  Invoke-LabelPrint $file.FullName
}
"#;

pub fn print_labels(req: DirectPrintRequest) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = req;
        return Err(
            "Impressão direta só funciona com o servidor Nexus no Windows, na mesma máquina da impressora."
                .into(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        print_labels_windows(req)
    }
}

#[cfg(target_os = "windows")]
fn print_labels_windows(req: DirectPrintRequest) -> Result<(), String> {
    let printer = req.printer_name.trim();
    if printer.is_empty() || printer.len() > 220 || printer.chars().any(|c| c.is_control()) {
        return Err("Nome da impressora inválido.".into());
    }
    if !(10.0..=300.0).contains(&req.width_mm) || !(10.0..=300.0).contains(&req.height_mm) {
        return Err("Tamanho da etiqueta fora do intervalo suportado.".into());
    }
    let copies = req.copies.clamp(1, 200);
    let offset_x = req.offset_x_mm.clamp(-10.0, 10.0);
    let fill = if (0.85..=1.2).contains(&req.fill_scale) {
        req.fill_scale
    } else {
        1.0
    };
    if req.pages_png_base64.is_empty() || req.pages_png_base64.len() > 80 {
        return Err("Informe de 1 a 80 etiquetas por envio.".into());
    }

    let dir = std::env::temp_dir().join(format!("nexus-label-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).map_err(|e| format!("Não foi possível preparar a impressão: {e}"))?;

    let result = (|| {
        for (i, raw) in req.pages_png_base64.iter().enumerate() {
            let bytes = decode_png(raw)?;
            let path = dir.join(format!("{:03}.png", i + 1));
            fs::write(&path, bytes).map_err(|e| format!("Não foi possível gravar a etiqueta: {e}"))?;
        }
        let script_path = dir.join("print.ps1");
        let mut script = fs::File::create(&script_path)
            .map_err(|e| format!("Não foi possível gravar o script: {e}"))?;
        script
            .write_all(&[0xEF, 0xBB, 0xBF])
            .and_then(|_| script.write_all(SCRIPT.as_bytes()))
            .map_err(|e| format!("Não foi possível gravar o script: {e}"))?;
        drop(script);

        run_print_script(&script_path, &dir, printer, req.width_mm, req.height_mm, copies, req.landscape, fill, offset_x)
    })();

    let _ = fs::remove_dir_all(&dir);
    result
}

fn decode_png(raw: &str) -> Result<Vec<u8>, String> {
    let data = raw
        .trim()
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(raw.trim());
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "Imagem da etiqueta inválida.".to_string())?;
    if bytes.len() < 8 || bytes.len() > 1_500_000 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Imagem da etiqueta inválida.".into());
    }
    Ok(bytes)
}

#[cfg(target_os = "windows")]
fn run_print_script(
    script: &PathBuf,
    dir: &PathBuf,
    printer: &str,
    width_mm: f64,
    height_mm: f64,
    copies: u32,
    landscape: bool,
    fill: f64,
    offset_x: f64,
) -> Result<(), String> {
    let child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(script)
        .env("NEXUS_PRINTER", printer)
        .env("NEXUS_DIR", dir)
        .env("NEXUS_WIDTH_MM", format!("{width_mm}"))
        .env("NEXUS_HEIGHT_MM", format!("{height_mm}"))
        .env("NEXUS_COPIES", copies.to_string())
        .env("NEXUS_LANDSCAPE", if landscape { "1" } else { "0" })
        .env("NEXUS_FILL", format!("{fill}"))
        .env("NEXUS_OFFSET_X", format!("{offset_x}"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Não foi possível falar com o Windows: {e}"))?;

    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    let out = match rx.recv_timeout(Duration::from_secs(45)) {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(format!("Falha ao acompanhar a impressão: {e}")),
        Err(_) => {
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();
            return Err("A impressora não respondeu a tempo.".into());
        }
    };

    if out.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let detail = if !stderr.trim().is_empty() {
        stderr.trim()
    } else {
        stdout.trim()
    };
    let line = detail.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    if line.is_empty() {
        Err("A impressora recusou o trabalho.".into())
    } else {
        Err(line.to_string())
    }
}

// ---------------------------------------------------------------------------------------------
// Impressão pelo servidor: LPD (PC Windows com a impressora compartilhada) ou TCP 9100, em ZPL/EPL.
// ---------------------------------------------------------------------------------------------

use sqlx::PgPool;

use super::lpr::{enviar_lpr, enviar_tcp_9100};
use super::models::HubPrinter;
use super::raw_label::{self, Bitmap};
use super::store;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Linguagem {
    Zpl,
    Epl,
}

fn montar_dados(paginas: &[(Bitmap, u32)], linguagem: Linguagem) -> Vec<u8> {
    let mut out = Vec::new();
    for (bm, copias) in paginas {
        out.extend(match linguagem {
            Linguagem::Zpl => raw_label::zpl(bm, *copias),
            Linguagem::Epl => raw_label::epl(bm, *copias),
        });
    }
    out
}

/// Envia as páginas (bitmap + cópias) pela conexão cadastrada. Bloqueante: chame em `spawn_blocking`.
fn linguagem_da(printer: &HubPrinter) -> Linguagem {
    if printer.raw_protocol.eq_ignore_ascii_case("epl") {
        Linguagem::Epl
    } else {
        Linguagem::Zpl
    }
}

fn enviar_para_impressora(printer: &HubPrinter, paginas: &[(Bitmap, u32)]) -> Result<(), String> {
    let linguagem = linguagem_da(printer);
    enviar_bytes(printer, &montar_dados(paginas, linguagem))
}

/// Entrega os comandos prontos pelo caminho da impressora (compartilhamento do Windows ou rede, porta 9100).
fn enviar_bytes(printer: &HubPrinter, dados: &[u8]) -> Result<(), String> {
    let ip = printer.ip_address.as_deref().unwrap_or("").trim().to_string();
    match printer.connection_type.as_str() {
        "windows_lpd" => {
            let fila = printer.system_printer_name.as_deref().unwrap_or("").trim().to_string();
            if ip.is_empty() || fila.is_empty() {
                return Err(
                    "Informe, em Impressoras, o PC (IP ou nome) e o nome do compartilhamento.".into(),
                );
            }
            enviar_lpr(&ip, &fila, dados, "etiquetas-nexus")
        }
        "network_tcp" => {
            if ip.is_empty() {
                return Err("Informe, em Impressoras, o IP da impressora.".into());
            }
            enviar_tcp_9100(&ip, dados)
        }
        _ => Err(MSG_NESTE_SERVIDOR.into()),
    }
}

const MSG_NESTE_SERVIDOR: &str = "Esta impressora está como «neste servidor». Em Impressoras, mude a conexão para «Compartilhada num PC Windows» e informe o PC e o nome do compartilhamento.";

async fn carregar_impressora(pool: &PgPool, req: &DirectPrintRequest) -> Result<Option<HubPrinter>, String> {
    let _ = store::ensure_tables(pool).await;
    if let Some(id) = req.printer_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        return match store::get_printer(pool, id).await {
            Ok(Some(p)) => Ok(Some(p)),
            Ok(None) => Err("Impressora não encontrada.".into()),
            Err(e) => Err(format!("Erro ao buscar impressora: {e}")),
        };
    }
    let nome = req.printer_name.trim();
    if nome.is_empty() {
        return Err("Impressora não informada.".into());
    }
    let lista = store::list_printers(pool)
        .await
        .map_err(|e| format!("Erro ao listar impressoras: {e}"))?;
    Ok(lista
        .into_iter()
        .find(|p| p.system_printer_name.as_deref().map(str::trim) == Some(nome)))
}

/// Serviço de impressão direta de etiquetas (usado pela rota `/direct`).
pub async fn imprimir_etiquetas(pool: &PgPool, mut req: DirectPrintRequest) -> Result<(), String> {
    if !(10.0..=300.0).contains(&req.width_mm) || !(10.0..=300.0).contains(&req.height_mm) {
        return Err("Tamanho da etiqueta fora do intervalo suportado.".into());
    }
    let nativo = !req.paginas_nativas.is_empty();
    let n_paginas = if nativo { req.paginas_nativas.len() } else { req.pages_png_base64.len() };
    tracing::info!("impressão direta: {} página(s) em modo {}", n_paginas, if nativo { "texto nativo" } else { "imagem" });
    if n_paginas == 0 || n_paginas > 80 {
        return Err("Informe de 1 a 80 etiquetas por envio.".into());
    }
    let copias = req.copies.clamp(1, 200);
    let printer = carregar_impressora(pool, &req).await?;

    let remota = matches!(
        printer.as_ref().map(|p| p.connection_type.as_str()),
        Some("windows_lpd") | Some("network_tcp")
    );
    if !remota {
        if nativo {
            return Err("Texto nativo só funciona em impressora de rede ou compartilhada num PC Windows.".into());
        }
        // Spooler local do Windows (caminho antigo).
        if let Some(p) = &printer {
            if req.printer_name.trim().is_empty() {
                req.printer_name = p.system_printer_name.clone().unwrap_or_default();
            }
        }
        if !cfg!(target_os = "windows") {
            return Err(MSG_NESTE_SERVIDOR.into());
        }
        return tokio::task::spawn_blocking(move || print_labels(req))
            .await
            .map_err(|e| format!("Falha ao imprimir: {e}"))?;
    }
    let printer = printer.expect("impressora remota carregada");

    if nativo {
        if req.landscape {
            return Err("Texto nativo imprime sem girar a etiqueta (orientação Deitada).".into());
        }
        let dpi = if printer.dpi >= 100 { printer.dpi as f64 } else { 203.0 };
        let alvo_w = ((req.width_mm / 25.4) * dpi).round() as u32;
        let alvo_h = ((req.height_mm / 25.4) * dpi).round() as u32;
        let deslocamento = ((req.offset_x_mm.clamp(-10.0, 10.0) / 25.4) * dpi).round() as i32;
        let epl = printer.raw_protocol.eq_ignore_ascii_case("epl");
        let paginas = std::mem::take(&mut req.paginas_nativas);
        return tokio::task::spawn_blocking(move || {
            let mut dados: Vec<u8> = Vec::new();
            for pag in &paginas {
                let imagem = match pag.imagem_png_base64.as_deref().filter(|r| !r.trim().is_empty()) {
                    Some(raw) => {
                        let bm = raw_label::png_para_bitmap_no_tamanho(&decode_png(raw)?, alvo_w, alvo_h)?;
                        Some(raw_label::preparar(bm, false, 1.0, deslocamento))
                    }
                    None => None,
                };
                dados.extend(super::nativo::montar_pagina(epl, dpi, alvo_w, alvo_h, pag, imagem.as_ref(), copias, deslocamento));
            }
            enviar_bytes(&printer, &dados)
        })
        .await
        .map_err(|e| format!("Falha ao imprimir: {e}"))?;
    }

    let landscape = req.landscape;
    let fill = req.fill_scale;
    let offset_x_mm = req.offset_x_mm.clamp(-10.0, 10.0);
    let paginas_png = std::mem::take(&mut req.pages_png_base64);
    // A imagem chega com o tamanho da etiqueta em mm; em pontos da impressora ela tem de ter mm × DPI dela.
    let dpi = if printer.dpi >= 100 { printer.dpi as f64 } else { 203.0 };
    let alvo_w = ((req.width_mm / 25.4) * dpi).round() as u32;
    let alvo_h = ((req.height_mm / 25.4) * dpi).round() as u32;
    let deslocamento = ((offset_x_mm / 25.4) * dpi).round() as i32;
    tokio::task::spawn_blocking(move || {
        let mut paginas = Vec::with_capacity(paginas_png.len());
        for raw in &paginas_png {
            let bm = raw_label::png_para_bitmap_no_tamanho(&decode_png(raw)?, alvo_w, alvo_h)?;
            paginas.push((raw_label::preparar(bm, landscape, fill, deslocamento), copias));
        }
        enviar_para_impressora(&printer, &paginas)
    })
    .await
    .map_err(|e| format!("Falha ao imprimir: {e}"))?
}

/// Etiqueta de teste desenhada no servidor: borda, diagonal curta e uma faixa preta.
fn bitmap_de_teste(largura_mm: f64, altura_mm: f64, dpi: i32) -> Bitmap {
    let dpi = dpi.clamp(100, 600) as f64;
    let w = ((largura_mm.clamp(10.0, 300.0) / 25.4) * dpi).round() as u32;
    let h = ((altura_mm.clamp(10.0, 300.0) / 25.4) * dpi).round() as u32;
    let mut bm = Bitmap::branco(w, h);
    let borda = (dpi / 100.0).ceil().max(2.0) as u32;
    for y in 0..h {
        for x in 0..w {
            let na_borda = x < borda || y < borda || x >= w - borda || y >= h - borda;
            let faixa = y >= h * 2 / 5 && y < h * 3 / 5 && x >= w / 8 && x < w * 7 / 8;
            let diag = (x as i64 - (y as i64 * w as i64 / h as i64)).unsigned_abs() < borda as u64 && y < h / 4;
            if na_borda || faixa || diag {
                bm.definir(x, y, true);
            }
        }
    }
    bm
}

/// Imprime uma etiqueta de teste na impressora cadastrada (rota `/:id/teste`).
pub async fn imprimir_teste(pool: &PgPool, id: &str) -> Result<(), String> {
    let printer = match store::get_printer(pool, id).await {
        Ok(Some(p)) => p,
        Ok(None) => return Err("Impressora não encontrada.".into()),
        Err(e) => return Err(format!("Erro ao buscar impressora: {e}")),
    };
    if !matches!(printer.connection_type.as_str(), "windows_lpd" | "network_tcp") {
        return Err(MSG_NESTE_SERVIDOR.into());
    }
    tokio::task::spawn_blocking(move || {
        let bm = bitmap_de_teste(printer.default_width_mm, printer.default_height_mm, printer.dpi);
        enviar_para_impressora(&printer, &[(bm, 1)])
    })
    .await
    .map_err(|e| format!("Falha ao imprimir: {e}"))?
}

/// Texto em ISO/CP850 para o EPL (acentos do português); fora do mapa vira `?`.
fn cp850(texto: &str) -> Vec<u8> {
    texto
        .chars()
        .map(|c| match c {
            'á' => 0xA0, 'é' => 0x82, 'í' => 0xA1, 'ó' => 0xA2, 'ú' => 0xA3, 'ã' => 0xC6, 'õ' => 0xE4, 'ç' => 0x87,
            'â' => 0x83, 'ê' => 0x88, 'ô' => 0x93, 'à' => 0x85, 'Á' => 0xB5, 'É' => 0x90, 'Ç' => 0x80, 'º' => 0xA7,
            c if c.is_ascii() => c as u8,
            _ => b'?',
        })
        .collect()
}

/// Etiqueta de teste com texto e código de barras **nativos** da impressora (fontes gravadas nela), para
/// comparar com a etiqueta enviada como imagem. Mesmas linhas da etiqueta de lote.
fn comandos_texto_nativo(linguagem: Linguagem, largura: u32, altura: u32) -> Vec<u8> {
    match linguagem {
        Linguagem::Zpl => {
            let mut s = format!("^XA^CI28^PW{largura}^LL{altura}^LH0,0");
            s.push_str("^FO40,30^A0N,44,40^FDKIT SH/COND/MASC PISTACHE^FS");
            s.push_str("^FO40,100^A0N,28,26^FDTexto nativo ZPL (fonte 0 escalavel)^FS");
            s.push_str("^FO40,150^BY3^BCN,70,Y,N,N^FD202611^FS");
            s.push_str("^FO40,265^A0N,36,34^FDN\u{ba} Lote: 202611^FS");
            s.push_str("^FO40,315^A0N,26,24^FDCont\u{e9}m 6 unidades  -  2.11.070^FS");
            s.push_str("^PQ1^XZ");
            s.into_bytes()
        }
        Linguagem::Epl => {
            let mut out: Vec<u8> = format!("\nN\nq{largura}\nQ{altura},24\nI8,1,001\n").into_bytes();
            let mut texto = |x: u32, y: u32, fonte: u32, hm: u32, vm: u32, t: &str| {
                out.extend(format!("A{x},{y},0,{fonte},{hm},{vm},N,\"").into_bytes());
                out.extend(cp850(t));
                out.extend(b"\"\n");
            };
            texto(40, 30, 4, 2, 2, "KIT SH/COND/MASC");
            texto(40, 110, 3, 1, 1, "Texto nativo EPL fonte 3 x1");
            texto(40, 150, 3, 2, 2, "Fonte 3 x2");
            texto(40, 215, 2, 2, 2, "Nº Lote: 202611");
            texto(40, 255, 4, 1, 1, "Contém 6 unidades");
            out.extend(b"B40,300,0,1,3,6,70,B,\"202611\"\n");
            out.extend(b"P1\n");
            out
        }
    }
}

/// Imprime a etiqueta de teste de texto nativo (rota `/:id/teste-texto`).
pub async fn imprimir_teste_texto(pool: &PgPool, id: &str) -> Result<(), String> {
    let printer = match store::get_printer(pool, id).await {
        Ok(Some(p)) => p,
        Ok(None) => return Err("Impressora não encontrada.".into()),
        Err(e) => return Err(format!("Erro ao buscar impressora: {e}")),
    };
    if !matches!(printer.connection_type.as_str(), "windows_lpd" | "network_tcp") {
        return Err(MSG_NESTE_SERVIDOR.into());
    }
    tokio::task::spawn_blocking(move || {
        let dpi = printer.dpi.clamp(100, 600) as f64;
        let largura = ((printer.default_width_mm.clamp(10.0, 300.0) / 25.4) * dpi).round() as u32;
        let altura = ((printer.default_height_mm.clamp(10.0, 300.0) / 25.4) * dpi).round() as u32;
        enviar_bytes(&printer, &comandos_texto_nativo(linguagem_da(&printer), largura, altura))
    })
    .await
    .map_err(|e| format!("Falha ao imprimir: {e}"))?
}

#[cfg(test)]
mod testes_servico {
    use super::*;

    #[test]
    fn texto_nativo_zpl_e_epl() {
        let z = comandos_texto_nativo(Linguagem::Zpl, 800, 400);
        assert!(z.starts_with(b"^XA") && z.ends_with(b"^XZ"));
        let e = comandos_texto_nativo(Linguagem::Epl, 800, 400);
        assert!(e.starts_with(b"\nN\nq800") && e.ends_with(b"P1\n"));
        assert!(e.windows(1).any(|w| w[0] == 0x82), "acento em CP850");
    }

    fn impressora(conexao: &str, ip: &str, fila: &str, proto: &str) -> HubPrinter {
        HubPrinter {
            id: "1".into(),
            name: "t".into(),
            system_printer_name: Some(fila.into()),
            printer_type: "thermal_label".into(),
            connection_type: conexao.into(),
            ip_address: Some(ip.into()),
            default_width_mm: 100.0,
            default_height_mm: 50.0,
            default_orientation: "landscape".into(),
            dpi: 203,
            location: None,
            status: "online".into(),
            is_default: false,
            raw_protocol: proto.into(),
            notes: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn teste_tem_tamanho_e_pontos() {
        let bm = bitmap_de_teste(100.0, 50.0, 203);
        assert_eq!((bm.largura, bm.altura), (799, 400));
        assert!(bm.ponto(0, 0) && bm.ponto(400, 200) && !bm.ponto(400, 120));
    }

    #[test]
    fn local_spooler_no_servidor_da_erro() {
        let p = impressora("local_spooler", "", "X", "zpl");
        assert!(enviar_para_impressora(&p, &[]).unwrap_err().contains("neste servidor"));
    }

    #[test]
    fn lpd_sem_dados_da_erro() {
        let p = impressora("windows_lpd", "", "", "zpl");
        assert!(enviar_para_impressora(&p, &[]).unwrap_err().contains("compartilhamento"));
    }

    #[test]
    fn epl_e_zpl_escolhidos_pelo_protocolo() {
        let b = Bitmap::branco(8, 1);
        assert!(montar_dados(&[(b.clone(), 1)], Linguagem::Zpl).starts_with(b"^XA"));
        assert!(montar_dados(&[(b, 1)], Linguagem::Epl).starts_with(b"\nN"));
    }
}
