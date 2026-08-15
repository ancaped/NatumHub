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
