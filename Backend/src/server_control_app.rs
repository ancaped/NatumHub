//! Executável com Interface Gráfica e Bandeja do Sistema para o Servidor Nexus (Nexus Server Control)
//!
//! Fornece:
//! 1. Ícone nativo na Bandeja do Windows (System Tray / Área de Notificação) com a logo oficial Nexus.
//! 2. Janela de aplicativo standalone (modo chromeless app sem abas/barra de endereço do navegador).
//! 3. Ao fechar a janela, o servidor continua em segundo plano visível na bandeja do sistema.
//! 4. Duplo clique no ícone da bandeja reabre o painel imediatamente.

use crate::server_manager::{global_server_manager, open_browser_url};

pub async fn run_server_control() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cfg = crate::core::app_config::load_client_config();
    let port = cfg.api_port;

    println!(
        "Nexus Server Control — Saves dir: {}",
        crate::core::app_config::saves_dir().display()
    );

    let manager = global_server_manager();

    // 1. Iniciar o servidor HTTP Axum em segundo plano
    if let Err(e) = manager.start_server().await {
        eprintln!("Erro ao iniciar servidor Axum: {}", e);
    }

    let control_url = format!("http://localhost:{}/server-control", port);
    println!("Painel Nexus Server disponível em: {}", control_url);

    // 2. Verificar se foi iniciado em modo background/daemon/minimized
    let is_background = std::env::args().any(|arg| {
        arg == "--background"
            || arg == "--daemon"
            || arg == "-d"
            || arg == "--minimized"
            || arg == "-m"
            || arg == "--silent"
    });

    if !is_background {
        open_control_window(&control_url);
    } else {
        println!("Servidor rodando silenciosamente em segundo plano.");
    }

    #[cfg(target_os = "windows")]
    {
        // No Windows, executa o loop nativo do System Tray (Bandeja de Apps)
        win_tray::run_tray_loop(port);
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tokio::signal::unix::{signal, SignalKind};
        if let (Ok(mut sigterm), Ok(mut sigint)) = (
            signal(SignalKind::terminate()),
            signal(SignalKind::interrupt()),
        ) {
            tokio::select! {
                _ = sigterm.recv() => println!("Sinal SIGTERM recebido. Encerrando..."),
                _ = sigint.recv() => println!("Sinal SIGINT recebido. Encerrando..."),
            }
        } else {
            let _ = tokio::signal::ctrl_c().await;
        }

        let _ = manager.stop_server().await;
    }
}

/// Abre a janela standalone do painel de controle do servidor
pub fn open_control_window(url: &str) {
    #[cfg(target_os = "windows")]
    {
        // 1. Tenta abrir no Microsoft Edge em modo janela de aplicativo nativo (--app)
        let edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        ];

        for path in &edge_paths {
            if std::path::Path::new(path).exists() {
                let status = std::process::Command::new(path)
                    .args([
                        &format!("--app={}", url),
                        "--new-window",
                    ])
                    .spawn();

                if status.is_ok() {
                    return;
                }
            }
        }

        // 2. Fallback direto no navegador padrão via ShellExecuteW
        open_browser_url(url);
    }

    #[cfg(not(target_os = "windows"))]
    {
        open_browser_url(url);
    }
}

#[cfg(target_os = "windows")]
mod win_tray {
    use super::*;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Shell::{
        Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_MESSAGE, NIF_TIP, NIIF_INFO, NIM_ADD,
        NIM_DELETE, NOTIFYICONDATAW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        AppendMenuW, CreateIconFromResourceEx, CreatePopupMenu, CreateWindowExW, DefWindowProcW,
        DestroyMenu, DestroyWindow, DispatchMessageW, GetCursorPos, GetMessageW, LoadIconW,
        PostQuitMessage, RegisterClassExW, SetForegroundWindow, TrackPopupMenu, TranslateMessage,
        HICON, IDI_APPLICATION, LR_DEFAULTCOLOR, MF_SEPARATOR, MF_STRING, TPM_RIGHTBUTTON,
        WM_CLOSE, WM_COMMAND, WM_DESTROY, WM_LBUTTONDBLCLK, WM_LBUTTONUP, WM_RBUTTONUP, WM_USER,
        WNDCLASSEXW,
    };

    const WM_TRAY_CALLBACK: u32 = WM_USER + 101;
    const MENU_OPEN_PANEL: usize = 1001;
    const MENU_OPEN_WEB: usize = 1002;
    const MENU_OPEN_SAVES: usize = 1003;
    const MENU_RESTART: usize = 1004;
    const MENU_EXIT: usize = 1005;

    fn to_wide_null(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn copy_to_wide_array<const N: usize>(dest: &mut [u16; N], src: &str) {
        let wide: Vec<u16> = src.encode_utf16().collect();
        let len = wide.len().min(N - 1);
        dest[..len].copy_from_slice(&wide[..len]);
        dest[len] = 0;
    }

    fn get_nexus_tray_icon() -> HICON {
        const ICO_BYTES: &[u8] = include_bytes!("nexus_icon.ico");
        unsafe {
            if ICO_BYTES.len() > 22 {
                let count = u16::from_le_bytes([ICO_BYTES[4], ICO_BYTES[5]]) as usize;
                for i in 0..count {
                    let entry_offset = 6 + i * 16;
                    if entry_offset + 16 <= ICO_BYTES.len() {
                        let w = ICO_BYTES[entry_offset] as u32;
                        let bytes_in_res = u32::from_le_bytes([
                            ICO_BYTES[entry_offset + 8],
                            ICO_BYTES[entry_offset + 9],
                            ICO_BYTES[entry_offset + 10],
                            ICO_BYTES[entry_offset + 11],
                        ]);
                        let img_offset = u32::from_le_bytes([
                            ICO_BYTES[entry_offset + 12],
                            ICO_BYTES[entry_offset + 13],
                            ICO_BYTES[entry_offset + 14],
                            ICO_BYTES[entry_offset + 15],
                        ]) as usize;

                        // Usa imagem de 32x32 ou 16x16
                        if (w == 32 || w == 16) && img_offset + (bytes_in_res as usize) <= ICO_BYTES.len() {
                            let sub_slice = &ICO_BYTES[img_offset..img_offset + (bytes_in_res as usize)];
                            let hicon = CreateIconFromResourceEx(
                                sub_slice.as_ptr(),
                                bytes_in_res,
                                1, // 1 = icon
                                0x00030000,
                                w as i32,
                                w as i32,
                                LR_DEFAULTCOLOR,
                            );
                            if hicon != std::ptr::null_mut() {
                                return hicon;
                            }
                        }
                    }
                }
            }

            LoadIconW(std::ptr::null_mut(), IDI_APPLICATION)
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_TRAY_CALLBACK => {
                let event = (lparam & 0xFFFF) as u32;
                // WM_LBUTTONUP (0x0202), WM_LBUTTONDBLCLK (0x0203), NIN_SELECT (0x0400), NIN_KEYSELECT (0x0401)
                if event == WM_LBUTTONUP || event == WM_LBUTTONDBLCLK || event == 0x0400 || event == 0x0401 {
                    let port = crate::core::app_config::load_client_config().api_port;
                    let url = format!("http://localhost:{}/server-control", port);
                    open_control_window(&url);
                } else if event == WM_RBUTTONUP || event == 0x0204 || event == 0x007B {
                    let mut pt = POINT { x: 0, y: 0 };
                    GetCursorPos(&mut pt);
                    SetForegroundWindow(hwnd);

                    let hmenu = CreatePopupMenu();
                    if hmenu != std::ptr::null_mut() {
                        let label_open = to_wide_null("⚡ Abrir Painel Nexus Server");
                        let label_web = to_wide_null("🌐 Abrir Nexus (Web)");
                        let label_saves = to_wide_null("📁 Abrir Pasta Saves");
                        let label_restart = to_wide_null("🔄 Reiniciar Servidor");
                        let label_exit = to_wide_null("❌ Sair e Encerrar Servidor");

                        AppendMenuW(hmenu, MF_STRING, MENU_OPEN_PANEL, label_open.as_ptr());
                        AppendMenuW(hmenu, MF_STRING, MENU_OPEN_WEB, label_web.as_ptr());
                        AppendMenuW(hmenu, MF_STRING, MENU_OPEN_SAVES, label_saves.as_ptr());
                        AppendMenuW(hmenu, MF_STRING, MENU_RESTART, label_restart.as_ptr());
                        AppendMenuW(hmenu, MF_SEPARATOR, 0, std::ptr::null());
                        AppendMenuW(hmenu, MF_STRING, MENU_EXIT, label_exit.as_ptr());

                        TrackPopupMenu(
                            hmenu,
                            TPM_RIGHTBUTTON,
                            pt.x,
                            pt.y,
                            0,
                            hwnd,
                            std::ptr::null(),
                        );
                        DestroyMenu(hmenu);
                    }
                }
                0
            }
            WM_COMMAND => {
                let cmd = (wparam & 0xFFFF) as usize;
                let port = crate::core::app_config::load_client_config().api_port;
                match cmd {
                    MENU_OPEN_PANEL => {
                        let url = format!("http://localhost:{}/server-control", port);
                        open_control_window(&url);
                    }
                    MENU_OPEN_WEB => {
                        let url = format!("http://localhost:{}", port);
                        open_browser_url(&url);
                    }
                    MENU_OPEN_SAVES => {
                        crate::server_manager::open_saves_folder();
                    }
                    MENU_RESTART => {
                        tokio::spawn(async {
                            let _ = global_server_manager().restart_server().await;
                        });
                    }
                    MENU_EXIT => {
                        remove_tray_icon(hwnd);
                        let _ = global_server_manager().stop_server();
                        DestroyWindow(hwnd);
                        PostQuitMessage(0);
                        std::process::exit(0);
                    }
                    _ => {}
                }
                0
            }
            WM_CLOSE => 0,
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    pub fn run_tray_loop(port: u16) {
        unsafe {
            let hinstance = GetModuleHandleW(std::ptr::null());
            let class_name = to_wide_null("NexusServerControlHiddenWindow");
            let icon = get_nexus_tray_icon();

            let mut wnd_class: WNDCLASSEXW = std::mem::zeroed();
            wnd_class.cbSize = std::mem::size_of::<WNDCLASSEXW>() as u32;
            wnd_class.lpfnWndProc = Some(wnd_proc);
            wnd_class.hInstance = hinstance;
            wnd_class.lpszClassName = class_name.as_ptr();
            wnd_class.hIcon = icon;

            let _atom = RegisterClassExW(&wnd_class);

            let window_title = to_wide_null("Nexus Server Control Host");
            let hwnd = CreateWindowExW(
                0x00000080, // WS_EX_TOOLWINDOW
                class_name.as_ptr(),
                window_title.as_ptr(),
                0x80000000, // WS_POPUP
                0,
                0,
                0,
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                hinstance,
                std::ptr::null(),
            );

            if hwnd != std::ptr::null_mut() {
                // Registrar ícone oficial do Nexus na bandeja (System Tray)
                let mut nid: NOTIFYICONDATAW = std::mem::zeroed();
                nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
                nid.hWnd = hwnd;
                nid.uID = 1;
                nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_INFO;
                nid.uCallbackMessage = WM_TRAY_CALLBACK;
                nid.hIcon = icon;
                nid.dwInfoFlags = NIIF_INFO;

                copy_to_wide_array(&mut nid.szTip, &format!("Nexus Server Control (Porta {})", port));
                copy_to_wide_array(&mut nid.szInfoTitle, "Nexus Server Control");
                copy_to_wide_array(
                    &mut nid.szInfo,
                    &format!("Servidor Nexus ativo na porta {}. Clique no ícone para abrir o painel.", port),
                );

                Shell_NotifyIconW(NIM_ADD, &nid);

                // Loop de mensagens do Windows
                let mut msg = std::mem::zeroed();
                loop {
                    let ret = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
                    if ret == 0 {
                        break;
                    }
                    if ret > 0 {
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    } else {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }

                // Cleanup ao sair
                Shell_NotifyIconW(NIM_DELETE, &nid);
            } else {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(60));
                }
            }
        }
    }

    fn remove_tray_icon(hwnd: HWND) {
        unsafe {
            let mut nid: NOTIFYICONDATAW = std::mem::zeroed();
            nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
            nid.hWnd = hwnd;
            nid.uID = 1;
            Shell_NotifyIconW(NIM_DELETE, &nid);
        }
    }
}
