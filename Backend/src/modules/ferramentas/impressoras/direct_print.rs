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
    pub printer_name: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub copies: u32,
    pub landscape: bool,
    pub fill_scale: f64,
    pub pages_png_base64: Vec<String>,
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

$files = @(Get-ChildItem -LiteralPath $dir -Filter '*.png' | Sort-Object Name)
if ($files.Count -eq 0) { throw 'Nenhuma imagem de etiqueta.' }

function Invoke-LabelPrint([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $loaded = [System.Drawing.Image]::FromStream($ms)
  $img = New-Object System.Drawing.Bitmap($loaded)
  $loaded.Dispose()
  $ms.Dispose()
  try {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printer
    if (-not $doc.PrinterSettings.IsValid) {
      throw "Impressora nao encontrada no Windows: $printer"
    }
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
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
    $global:NexusPrintImg = $img
    $global:NexusPrintW = $widthMm
    $global:NexusPrintH = $heightMm
    $global:NexusPrintFill = $fill

    $doc.add_PrintPage({
      param($sender, $e)
      $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Millimeter
      $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $drawW = $global:NexusPrintW * $global:NexusPrintFill
      $drawH = $global:NexusPrintH * $global:NexusPrintFill
      $ox = ($global:NexusPrintW - $drawW) / 2.0
      $oy = ($global:NexusPrintH - $drawH) / 2.0
      $rect = New-Object System.Drawing.RectangleF([single]$ox, [single]$oy, [single]$drawW, [single]$drawH)
      $e.Graphics.DrawImage($global:NexusPrintImg, $rect)
      $e.HasMorePages = $false
    })

    for ($i = 0; $i -lt $copies; $i++) {
      $doc.Print()
    }
    $doc.Dispose()
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

        run_print_script(&script_path, &dir, printer, req.width_mm, req.height_mm, copies, req.landscape, fill)
    })();

    let _ = fs::remove_dir_all(&dir);
    result
}

#[cfg(target_os = "windows")]
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
