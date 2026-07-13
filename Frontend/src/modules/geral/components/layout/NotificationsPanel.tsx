import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Wifi, WifiOff, Loader2, CheckCheck } from 'lucide-react';
import type { AuthUser } from '../../lib/auth';
import { checkServerHealth } from '../../lib/connectionConfig';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  moduleLabelForNotification,
  kindStyles,
  formatNotificationTime,
  type HubNotification,
} from '../../lib/notifications';

interface NotificationsPanelProps {
  currentUser: AuthUser;
}

export default function NotificationsPanel({ currentUser }: NotificationsPanelProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HubNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | undefined>();
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, count, health] = await Promise.all([
        fetchNotifications(),
        fetchUnreadCount(),
        checkServerHealth(),
      ]);
      setItems(list);
      setUnread(count);
      setServerOnline(health.ok);
      setLatencyMs(health.latencyMs);
    } catch {
      setItems([]);
      setUnread(0);
      setServerOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh, currentUser.id]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((c) => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const connectionLabel = 'API local';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center h-9 w-9 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 transition-all cursor-pointer focus:outline-none shadow-sm"
        title="Notificações"
      >
        <Bell className="h-4 w-4 text-zinc-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-black leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-zinc-900">Notificações</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                {currentUser.displayName}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-zinc-800"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          <div
            className={`mx-3 mt-3 mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
              serverOnline === null
                ? 'border-zinc-200 bg-zinc-50 text-zinc-500'
                : serverOnline
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {serverOnline ? (
              <Wifi className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold">{connectionLabel}</p>
              <p className="text-[10px] opacity-80">
                {serverOnline === null
                  ? 'Verificando...'
                  : serverOnline
                    ? `Online${latencyMs != null ? ` · ${latencyMs}ms` : ''}`
                    : 'Offline — verifique rede ou PC principal'}
              </p>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto px-2 pb-2">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8 px-4">
                Nenhuma notificação dos seus módulos no momento.
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((n) => {
                  const styles = kindStyles(n.kind);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => !n.read && handleMarkRead(n.id)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                          n.read ? 'hover:bg-zinc-50' : `${styles.bg} hover:opacity-90`
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${styles.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs font-black truncate ${n.read ? 'text-zinc-700' : styles.text}`}>
                                {n.title}
                              </p>
                              {!n.read && (
                                <span className="text-[9px] font-bold uppercase text-zinc-400 shrink-0">Nova</span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-600 mt-0.5 leading-snug">{n.message}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                {moduleLabelForNotification(n.moduleKey)}
                              </span>
                              <span className="text-[9px] text-zinc-400 font-mono">
                                {formatNotificationTime(n.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
