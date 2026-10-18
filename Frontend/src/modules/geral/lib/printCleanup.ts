/**
 * Remove iframes de impressão órfãos.
 * No Firefox, React pode crashar com `can't access property "body", s is null`
 * se um iframe de print invalidado ainda estiver no DOM / com foco.
 */
export function cleanupPrintIframes() {
  try {
    if (typeof document === 'undefined') return;
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
    document.querySelectorAll('iframe[data-natum-print="1"]').forEach((el) => {
      try {
        (el as HTMLIFrameElement).src = 'about:blank';
        el.remove();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Imprime conteúdo HTML diretamente via iframe oculto sem abrir uma nova aba/janela no navegador.
 */
export function printHtmlViaIframe(html: string) {
  cleanupPrintIframes();
  if (typeof document === 'undefined' || !document.body) return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-natum-print', '1');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = 'about:blank';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) {
        iframe.blur();
      }
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }
  };

  const runPrint = () => {
    if (started || cleaned) return;
    started = true;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!win || !doc) {
      cleanup();
      return;
    }

    try {
      doc.open();
      doc.write(html);
      doc.close();
    } catch {
      cleanup();
      return;
    }

    setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 250);
  };

  iframe.onload = () => runPrint();
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}
