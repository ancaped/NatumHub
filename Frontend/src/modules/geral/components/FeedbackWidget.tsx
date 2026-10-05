import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bug, MessageSquare, X, Upload, Camera, Lock,
  Send, Sparkles, Check, Mic, Square, Trash2,
  ArrowLeft, Search, Users, Hash, MessageCircle, ListFilter, Plus,
  User, ShieldCheck, UserCheck
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { api } from '../lib/api';
import { apiJson } from '../lib/http';
import { getLogs } from '../lib/logInterceptor';
import { randomId, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { buildFeedbackPagePath, splitFeedbackPagePath } from '../lib/viewLabels';
import type { AuthUser } from '../lib/auth';

interface FeedbackWidgetProps {
  currentView?: string;
  visible?: boolean;
  currentUser?: AuthUser | null;
  setView?: (view: string) => void;
}

type WidgetTab = 'feedback' | 'chat' | 'ia';
type ChatFilter = 'all' | 'channels' | 'operators';

interface ConversationItem {
  id: string;
  name: string;
  is_group: boolean;
  is_protected?: boolean;
  role?: string;
  description?: string;
  last_message?: string;
  last_message_time?: string;
}

interface ChatMessageItem {
  id: string;
  channel: string;
  sender_name: string;
  sender_role?: string;
  content: string;
  is_encrypted: boolean;
  message_type?: 'text' | 'image' | 'audio' | 'file';
  attachment_data?: string;
  attachment_name?: string;
  created_at?: string;
}

interface FeedbackItem {
  id: string;
  feedbackType: string;
  description: string;
  page: string;
  status: string;
  createdAt?: string;
  resolvedAt?: string;
  requestedBy?: string;
  priority?: number;
  adminNotes?: string;
  hasLogs?: boolean;
  hasScreenshot?: boolean;
  notesCount?: number;
}

interface FeedbackNote {
  id: string;
  feedbackId: string;
  author: string;
  body: string;
  createdAt: string;
}

interface FeedbackDetailData extends FeedbackItem {
  logs?: string;
  screenshot?: string;
  notes: FeedbackNote[];
}

interface AiMessage {
  id: string;
  sender: 'user' | 'ia';
  text: string;
  timestamp: string;
  suggested_actions?: string[];
}

// Cifra simétrica simples
function encryptContent(text: string, secretKey = 'NatumHubSecureKey2026'): string {
  try {
    const chars = text.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ secretKey.charCodeAt(i % secretKey.length))
    );
    return btoa(unescape(encodeURIComponent(chars.join(''))));
  } catch {
    return text;
  }
}

function decryptContent(encryptedText: string, secretKey = 'NatumHubSecureKey2026'): string {
  try {
    const decoded = decodeURIComponent(escape(atob(encryptedText)));
    return decoded
      .split('')
      .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ secretKey.charCodeAt(i % secretKey.length)))
      .join('');
  } catch {
    return encryptedText;
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  queued: 'Na Fila',
  in_progress: 'Em Andamento',
  awaiting_review: 'Aguardando Revisão',
  resolved: 'Resolvido',
  wont_fix: 'Não será feito',
};

export function FeedbackWidget({ currentView, visible = false, currentUser }: FeedbackWidgetProps) {
  const isSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';

  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<WidgetTab>('feedback');

  // Auto-ocultação do botão flutuante para a borda após inatividade
  useEffect(() => {
    let timeout: any;
    const handleActivity = () => {
      setCollapsed(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setCollapsed(true);
      }, 5000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    timeout = setTimeout(() => setCollapsed(true), 5000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearTimeout(timeout);
    };
  }, []);

  // Estado Feedback/Bug
  const [feedbackMode, setFeedbackMode] = useState<'form' | 'list' | 'detail'>('form');
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feedback'>('bug');
  const [module, setModule] = useState('Geral');
  const [subPage, setSubPage] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string>('');
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Lista e Detalhes de Feedbacks
  const [feedbacksList, setFeedbacksList] = useState<FeedbackItem[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDetailData | null>(null);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackFilterStatus, setFeedbackFilterStatus] = useState<string>('ALL');
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Estado Chat (WhatsApp Style)
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [searchContact, setSearchContact] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [chatAttachment, setChatAttachment] = useState<{ type: 'image' | 'audio' | 'file'; data: string; name: string } | null>(null);

  // Modal Novo Grupo / Senha
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupPassword, setNewGroupPassword] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Modal Senha do Canal
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [targetProtectedConv, setTargetProtectedConv] = useState<ConversationItem | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockedChannels, setUnlockedChannels] = useState<Set<string>>(new Set());

  // Gravador de Áudio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const notesBottomRef = useRef<HTMLDivElement>(null);

  // Estado Assistente IA
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: 'welcome',
      sender: 'ia',
      text: 'Olá! Sou o Assistente NatumHub. Como posso te orientar sobre processos, estoque, compras ou regras do sistema?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggested_actions: ['Como consultar a Saúde de Estoque?', 'Como criar grupos no Chat?', 'Como reportar um bug?'],
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Sincronizar contexto da página atual
  useEffect(() => {
    if (currentView) {
      const full = buildFeedbackPagePath(currentView);
      const { module: m, subPage: s } = splitFeedbackPagePath(full);
      setModule(m);
      setSubPage(s);
    }
  }, [currentView]);

  // Carregar conversas e contatos
  const loadConversations = useCallback(async () => {
    try {
      const res = await apiJson<{ conversations: ConversationItem[] }>('/api/chat/conversations');
      if (res && Array.isArray(res.conversations) && res.conversations.length > 0) {
        setConversations(res.conversations);
      } else {
        // Fallback: carregar operadores de /api/auth/operators
        const ops = await apiJson<Array<{ displayName: string; role: string }>>('/api/auth/operators');
        if (Array.isArray(ops)) {
          const defaults: ConversationItem[] = [
            { id: 'geral', name: 'Canal Geral', is_group: true, description: 'Comunicação geral de toda a fábrica' },
            { id: 'producao', name: 'Produção & Fábrica', is_group: true, description: 'Ordens, bases, envase e lotes' },
            { id: 'compras', name: 'Compras & Almoxarifado', is_group: true, description: 'Faltas, cotações e recebimento de insumos' },
            { id: 'qualidade', name: 'Qualidade & Laboratório', is_group: true, description: 'Laudos, POPs, microbiologia e CQ' },
          ];
          const opItems: ConversationItem[] = ops.map((op) => ({
            id: `user_${op.displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            name: op.displayName,
            is_group: false,
            role: op.role,
            description: `Função: ${op.role}`,
          }));
          setConversations([...defaults, ...opItems]);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar conversas:', e);
    }
  }, []);

  // Carregar lista de feedbacks
  const loadFeedbacksList = useCallback(async () => {
    try {
      const res = await apiJson<FeedbackItem[]>('/api/hub/feedbacks');
      if (Array.isArray(res)) {
        setFeedbacksList(res);
      }
    } catch (e) {
      console.error('Erro ao carregar feedbacks:', e);
    }
  }, []);

  // Carregar detalhes de um feedback
  const loadFeedbackDetail = async (id: string) => {
    try {
      const res = await apiJson<FeedbackDetailData>(`/api/hub/feedbacks/${id}`);
      if (res) {
        setSelectedFeedback(res);
        setFeedbackMode('detail');
      }
    } catch (e) {
      console.error('Erro ao carregar detalhes do feedback:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      loadFeedbacksList();
    }
  }, [isOpen, loadConversations, loadFeedbacksList]);

  // Determinar o ID do canal (especialmente para conversas 1-para-1 diretas)
  const resolveChannelId = (conv: ConversationItem): string => {
    if (conv.is_group) return conv.id;
    // Conversa direta entre 2 operadores
    const myId = currentUser?.displayName || currentUser?.username || 'operador';
    const otherId = conv.name;
    const pair = [myId.toLowerCase(), otherId.toLowerCase()].sort().join('_');
    return `dm_${pair}`;
  };

  // Carregar mensagens do chat
  const loadMessages = useCallback(async (channelId: string) => {
    setChatLoading(true);
    try {
      const res = await apiJson<{ messages: ChatMessageItem[] }>(`/api/chat/messages?channel=${encodeURIComponent(channelId)}&limit=100`);
      if (res && res.messages) {
        const decrypted = res.messages.map((m) => ({
          ...m,
          content: m.is_encrypted ? decryptContent(m.content) : m.content,
        }));
        setChatMessages(decrypted);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
    } finally {
      setChatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeConversation) {
      const channelId = resolveChannelId(activeConversation);
      loadMessages(channelId);
      const interval = setInterval(() => loadMessages(channelId), 3000);
      return () => clearInterval(interval);
    }
  }, [activeConversation, loadMessages]);

  const handleSelectConversation = (conv: ConversationItem) => {
    if (conv.is_protected && !unlockedChannels.has(conv.id)) {
      setTargetProtectedConv(conv);
      setUnlockPassword('');
      setUnlockError('');
      setUnlockModalOpen(true);
    } else {
      setActiveConversation(conv);
    }
  };

  const handleVerifyPassword = async () => {
    if (!targetProtectedConv) return;
    try {
      const res = await apiJson<{ valid: boolean }>('/api/chat/verify-password', {
        method: 'POST',
        body: JSON.stringify({
          group_id: targetProtectedConv.id,
          password: unlockPassword,
        }),
      });

      if (res && res.valid) {
        setUnlockedChannels((prev) => new Set(prev).add(targetProtectedConv.id));
        setActiveConversation(targetProtectedConv);
        setUnlockModalOpen(false);
      } else {
        setUnlockError('Senha incorreta.');
      }
    } catch (e) {
      setUnlockError('Erro ao verificar senha.');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await apiJson<{ group: ConversationItem }>('/api/chat/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim() || undefined,
          password: newGroupPassword.trim() || undefined,
          created_by: currentUser?.displayName || currentUser?.username || 'Operador',
        }),
      });

      if (res && res.group) {
        setConversations((prev) => [res.group, ...prev]);
        setShowNewGroupModal(false);
        setNewGroupName('');
        setNewGroupDesc('');
        setNewGroupPassword('');
        if (res.group.is_protected) {
          setUnlockedChannels((prev) => new Set(prev).add(res.group.id));
        }
        setActiveConversation(res.group);
      }
    } catch (err) {
      alert('Erro ao criar grupo.');
    } finally {
      setCreatingGroup(false);
    }
  };

  // Envio de mensagem no chat
  const handleSendMessage = async () => {
    if (!activeConversation) return;
    const text = chatInput.trim();
    if (!text && !chatAttachment) return;

    const channelId = resolveChannelId(activeConversation);
    const encrypted = encryptContent(text);
    const senderName = currentUser?.displayName || currentUser?.username || 'Operador';
    const senderRole = currentUser?.role || 'operador';

    try {
      const res = await apiJson<{ message: any }>('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          channel: channelId,
          sender_name: senderName,
          sender_role: senderRole,
          content_encrypted: encrypted,
          is_encrypted: true,
          message_type: chatAttachment ? chatAttachment.type : 'text',
          attachment_data: chatAttachment?.data,
          attachment_name: chatAttachment?.name,
        }),
      });

      if (res.message) {
        const newMsg: ChatMessageItem = {
          id: res.message.id,
          channel: res.message.channel,
          sender_name: res.message.sender_name,
          sender_role: res.message.sender_role,
          content: text,
          is_encrypted: true,
          message_type: chatAttachment ? chatAttachment.type : 'text',
          attachment_data: chatAttachment?.data,
          attachment_name: chatAttachment?.name,
          created_at: res.message.created_at || new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, newMsg]);
        setChatInput('');
        setChatAttachment(null);
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    } catch (e) {
      console.error('Erro ao enviar mensagem:', e);
    }
  };

  // Gravação de áudio nativa
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setChatAttachment({
            type: 'audio',
            data: reader.result as string,
            name: `audio_${Date.now()}.webm`,
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      alert('Permissão de microfone não concedida.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      audioChunksRef.current = [];
    }
  };

  // Captura de tela para formulário de Bug
  const captureScreen = async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const dataUrl = await htmlToImage.toPng(document.body, {
        width: window.innerWidth,
        height: window.innerHeight,
        style: {
          width: window.innerWidth + 'px',
          height: window.innerHeight + 'px',
          transform: 'none',
          left: '0',
          top: '0',
        },
        filter: (node: HTMLElement) => {
          if (
            node.classList &&
            (node.classList.contains('feedback-widget-trigger') ||
              node.classList.contains('feedback-widget-container'))
          ) {
            return false;
          }
          return true;
        },
        pixelRatio: 1,
        cacheBust: false,
      });
      setScreenshot(dataUrl);
      setIncludeScreenshot(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Erro ao capturar a tela: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) {
                setScreenshot(ev.target.result as string);
                setIncludeScreenshot(true);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setScreenshot(ev.target.result as string);
          setIncludeScreenshot(true);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!description.trim()) return;
    setLoading(true);
    try {
      const finalPage = subPage.trim()
        ? `${module} > ${subPage.trim()}`
        : (module || buildFeedbackPagePath(currentView));

      await api.createFeedback({
        type: feedbackType,
        description: description.trim(),
        page: finalPage,
        logs: getLogs(),
        screenshot: includeScreenshot ? screenshot : undefined,
      });
      setSent(true);
      loadFeedbacksList();
      setTimeout(() => {
        setSent(false);
        setDescription('');
        setScreenshot('');
        setIncludeScreenshot(false);
        setFeedbackMode('list');
      }, 1200);
    } catch (err) {
      console.error('Failed to send feedback:', err);
      alert('Erro ao enviar feedback. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Adicionar comentário/nota a feedback existente
  const handleAddNote = async () => {
    if (!selectedFeedback || !newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiJson<FeedbackNote>(`/api/hub/feedbacks/${selectedFeedback.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: newNoteText.trim() }),
      });

      setSelectedFeedback((prev) => prev ? {
        ...prev,
        notes: [...prev.notes, note],
        notesCount: (prev.notesCount || 0) + 1,
      } : null);

      setNewNoteText('');
      setTimeout(() => notesBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      loadFeedbacksList();
    } catch (err) {
      alert('Erro ao adicionar comentário.');
    } finally {
      setSavingNote(false);
    }
  };

  // Supervisor altera status
  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedFeedback) return;
    setUpdatingStatus(true);
    try {
      await apiJson(`/api/hub/feedbacks/${selectedFeedback.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });

      setSelectedFeedback((prev) => prev ? { ...prev, status: newStatus } : null);
      loadFeedbacksList();
    } catch (err) {
      alert('Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Assistente de IA
  const handleSendAi = async (customPrompt?: string) => {
    const text = customPrompt || aiInput.trim();
    if (!text) return;

    const userMsg: AiMessage = {
      id: randomId(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiLoading(true);

    try {
      const res = await apiJson<{ response: string; suggested_actions?: string[] }>('/api/chat/ai', {
        method: 'POST',
        body: JSON.stringify({
          prompt: text,
          module_context: module,
          user_name: currentUser?.displayName || currentUser?.username || 'Operador',
        }),
      });

      const iaMsg: AiMessage = {
        id: randomId(),
        sender: 'ia',
        text: res.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggested_actions: res.suggested_actions,
      };

      setAiMessages((prev) => [...prev, iaMsg]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          id: randomId(),
          sender: 'ia',
          text: 'Desculpe, tive um problema ao consultar as informações. Tente novamente em instantes.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Filtros de feedbacks
  const filteredFeedbacks = feedbacksList.filter((fb) => {
    const matchesSearch =
      fb.description.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
      fb.page.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
      (fb.requestedBy && fb.requestedBy.toLowerCase().includes(feedbackSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (feedbackFilterStatus === 'ALL') return true;
    if (feedbackFilterStatus === 'OPEN') return ['pending', 'queued', 'in_progress', 'awaiting_review'].includes(fb.status);
    if (feedbackFilterStatus === 'RESOLVED') return fb.status === 'resolved';
    return fb.status === feedbackFilterStatus;
  });

  // Filtros de conversas no Chat
  const filteredConversations = conversations.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchContact.toLowerCase()) ||
      (c.role && c.role.toLowerCase().includes(searchContact.toLowerCase())) ||
      (c.description && c.description.toLowerCase().includes(searchContact.toLowerCase()));

    if (!matchesSearch) return false;
    if (chatFilter === 'channels') return c.is_group;
    if (chatFilter === 'operators') return !c.is_group;
    return true;
  });

  const channelsCount = conversations.filter((c) => c.is_group).length;
  const operatorsCount = conversations.filter((c) => !c.is_group).length;

  return (
    <>
      {/* Botão Flutuante Minimalista Monocromático: SEMPRE 1 ÚNICO ÍCONE */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 feedback-widget-trigger transition-all duration-300',
          collapsed ? 'translate-x-6 opacity-60 hover:translate-x-0 hover:opacity-100' : 'translate-x-0 opacity-100'
        )}
        onMouseEnter={() => setCollapsed(false)}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-3 bg-zinc-900 text-zinc-100 rounded-full shadow-xl border border-zinc-700 hover:bg-zinc-800 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
          title="Bugs, Feedbacks & Chat"
        >
          <Bug className="h-4 w-4 text-zinc-300" />
        </button>
      </div>

      {/* Janela Flutuante Monocromática e Coesa com NatumHub (bg-white, border-zinc-200) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="fixed bottom-20 right-6 z-50 w-[440px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-white text-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden feedback-widget-container font-sans"
          >
            {/* Header com Navegação de Abas Monocromático */}
            <div className="bg-white border-b border-zinc-200 p-3 flex items-center justify-between shrink-0 shadow-2xs">
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('feedback')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    activeTab === 'feedback' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  )}
                >
                  <Bug className="w-3.5 h-3.5 text-zinc-700" />
                  <span>Bugs & Ideias</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('chat');
                    loadConversations();
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    activeTab === 'chat' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-700" />
                  <span>Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('ia')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                    activeTab === 'ia' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5 text-zinc-700" />
                  <span>Assistente IA</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ABA: BUGS & IDEIAS */}
            {activeTab === 'feedback' && (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* Sub-header de navegação entre Formulário e Lista */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 bg-zinc-50 text-xs shrink-0">
                  {feedbackMode === 'detail' ? (
                    <button
                      type="button"
                      onClick={() => setFeedbackMode('list')}
                      className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900 font-bold transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar para Lista</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 w-full">
                      <button
                        type="button"
                        onClick={() => setFeedbackMode('form')}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer',
                          feedbackMode === 'form' ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
                        )}
                      >
                        + Novo Relato
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFeedbackMode('list');
                          loadFeedbacksList();
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                          feedbackMode === 'list' ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
                        )}
                      >
                        <ListFilter className="w-3.5 h-3.5" />
                        <span>Fila de Feedbacks ({feedbacksList.length})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* MODO 1: FORMULÁRIO */}
                {feedbackMode === 'form' && (
                  <div className="flex-1 overflow-y-auto p-4 space-y-4" onPaste={handlePaste}>
                    {sent ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-800 flex items-center justify-center border border-zinc-200">
                          <Check className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900">Relato Enviado com Sucesso!</h4>
                        <p className="text-xs text-zinc-500">
                          Seu relato foi salvo no banco de dados e adicionado à fila para revisão.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setFeedbackType('bug')}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer',
                              feedbackType === 'bug'
                                ? 'bg-zinc-900 border-zinc-900 text-white shadow-xs'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            )}
                          >
                            <Bug className="h-4 w-4" /> Bug / Falha
                          </button>
                          <button
                            type="button"
                            onClick={() => setFeedbackType('feedback')}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer',
                              feedbackType === 'feedback'
                                ? 'bg-zinc-900 border-zinc-900 text-white shadow-xs'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            )}
                          >
                            <MessageSquare className="h-4 w-4" /> Sugestão / Ideia
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                              Módulo
                            </label>
                            <input
                              type="text"
                              value={module}
                              onChange={(e) => setModule(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                              Página / Aba
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: Dashboard, Estoque..."
                              value={subPage}
                              onChange={(e) => setSubPage(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-800 placeholder-zinc-400"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                            Descrição
                          </label>
                          <textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Descreva o problema ou sugestão (Cole imagem com Ctrl+V se desejar)"
                            className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none placeholder-zinc-400"
                          />
                        </div>

                        {/* Anexo de Captura de Tela */}
                        <div>
                          <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeScreenshot}
                              onChange={(e) => {
                                setIncludeScreenshot(e.target.checked);
                                if (!e.target.checked) setScreenshot('');
                              }}
                              className="rounded border-zinc-300"
                            />
                            Anexar captura de tela (opcional)
                          </label>
                          {includeScreenshot && (
                            <>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={captureScreen}
                                  disabled={loading}
                                  className="flex-1 flex items-center justify-center gap-2 p-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 text-zinc-700 font-bold text-xs cursor-pointer disabled:opacity-50"
                                >
                                  <Camera className="h-4 w-4 text-zinc-500" />
                                  <span>{loading ? 'Capturando...' : 'Capturar Tela'}</span>
                                </button>
                                <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 p-2 border border-dashed border-zinc-200 rounded-xl hover:bg-zinc-50 text-zinc-700 font-bold text-xs">
                                  <Upload className="h-4 w-4 text-zinc-400" />
                                  <span>Enviar Arquivo</span>
                                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                </label>
                              </div>
                              {screenshot && (
                                <div className="mt-2 relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 max-h-32">
                                  <img src={screenshot} alt="Screenshot" className="w-full object-contain max-h-32" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setScreenshot('');
                                      setIncludeScreenshot(false);
                                    }}
                                    className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full p-1 hover:bg-black"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="text-[11px] text-zinc-500 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 leading-relaxed">
                          Seu nome, data e hora serão registrados automaticamente. Logs do console e contexto da página são anexados.
                        </div>

                        <button
                          type="button"
                          onClick={handleSubmitFeedback}
                          disabled={loading || !description.trim()}
                          className="w-full p-2.5 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 shadow-md active:scale-[0.98] cursor-pointer"
                        >
                          {loading ? 'Enviando...' : 'Enviar Report'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* MODO 2: LISTA DE FEEDBACKS */}
                {feedbackMode === 'list' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 border-b border-zinc-100 space-y-2 bg-zinc-50">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={feedbackSearch}
                          onChange={(e) => setFeedbackSearch(e.target.value)}
                          placeholder="Buscar relatos..."
                          className="w-full bg-white border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                        {['ALL', 'OPEN', 'RESOLVED'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setFeedbackFilterStatus(st)}
                            className={cn(
                              'px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer',
                              feedbackFilterStatus === st ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
                            )}
                          >
                            {st === 'ALL' ? 'Todos' : st === 'OPEN' ? 'Abertos' : 'Finalizados'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                      {filteredFeedbacks.length === 0 ? (
                        <div className="text-center py-12 text-zinc-400 text-xs">
                          Nenhum relato encontrado nesta categoria.
                        </div>
                      ) : (
                        filteredFeedbacks.map((fb) => {
                          const label = STATUS_LABELS[fb.status] || 'Pendente';
                          return (
                            <div
                              key={fb.id}
                              onClick={() => loadFeedbackDetail(fb.id)}
                              className="p-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl transition-all cursor-pointer space-y-2 shadow-2xs hover:shadow-xs group"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-800 border-zinc-200">
                                  {label}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {fb.requestedBy ? `@${fb.requestedBy}` : 'Operador'}
                                </span>
                              </div>

                              <p className="text-xs font-medium text-zinc-800 line-clamp-2 leading-relaxed">
                                {fb.description}
                              </p>

                              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
                                <span className="truncate max-w-[220px]">{fb.page}</span>
                                <div className="flex items-center gap-2">
                                  {fb.hasScreenshot && <Camera className="w-3 h-3 text-zinc-400" />}
                                  {fb.notesCount && fb.notesCount > 0 ? (
                                    <span className="flex items-center gap-1 text-zinc-700 font-bold">
                                      <MessageCircle className="w-3 h-3" />
                                      {fb.notesCount}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* MODO 3: DETALHES & CHAT DE NOTAS */}
                {feedbackMode === 'detail' && selectedFeedback && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 bg-zinc-50 border-b border-zinc-200 space-y-2 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-500 truncate max-w-[240px]">
                          {selectedFeedback.page}
                        </span>

                        {isSupervisor ? (
                          <div className="relative">
                            <select
                              value={selectedFeedback.status}
                              disabled={updatingStatus}
                              onChange={(e) => handleUpdateStatus(e.target.value)}
                              className="bg-white border border-zinc-300 text-xs font-bold rounded-lg px-2 py-1 text-zinc-800 focus:outline-none shadow-2xs cursor-pointer"
                            >
                              <option value="pending">Pendente</option>
                              <option value="queued">Na Fila</option>
                              <option value="in_progress">Em Andamento</option>
                              <option value="awaiting_review">Aguardando Revisão</option>
                              <option value="resolved">Resolvido</option>
                              <option value="wont_fix">Não será feito</option>
                            </select>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-800 border-zinc-200">
                            {STATUS_LABELS[selectedFeedback.status] || 'Pendente'}
                          </span>
                        )}
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 leading-relaxed shadow-2xs">
                        {selectedFeedback.description}
                      </div>

                      {selectedFeedback.screenshot && (
                        <div className="rounded-xl overflow-hidden border border-zinc-200 max-h-24 bg-zinc-100">
                          <img src={selectedFeedback.screenshot} alt="Anexo" className="w-full h-auto object-contain max-h-24" />
                        </div>
                      )}
                    </div>

                    {/* Timeline de Comentários / Chat */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-zinc-50/50">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider text-center my-1">
                        Histórico & Comentários
                      </div>

                      {selectedFeedback.notes && selectedFeedback.notes.length > 0 ? (
                        selectedFeedback.notes.map((note) => {
                          const isMe = note.author === (currentUser?.displayName || currentUser?.username);
                          return (
                            <div
                              key={note.id}
                              className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}
                            >
                              <span className="text-[10px] text-zinc-400 px-1 mb-0.5 font-bold">
                                {note.author}
                              </span>
                              <div
                                className={cn(
                                  'p-2.5 rounded-xl text-xs max-w-[85%] leading-relaxed shadow-2xs',
                                  isMe
                                    ? 'bg-zinc-900 text-white rounded-br-xs'
                                    : 'bg-white text-zinc-800 border border-zinc-200 rounded-bl-xs'
                                )}
                              >
                                {note.body}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-6 text-zinc-400 text-xs">
                          Nenhum comentário ainda. Adicione uma resposta abaixo!
                        </div>
                      )}
                      <div ref={notesBottomRef} />
                    </div>

                    {/* Input de Novo Comentário */}
                    <div className="p-2.5 bg-white border-t border-zinc-200 flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                        placeholder="Escrever resposta ou comentário..."
                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={savingNote || !newNoteText.trim()}
                        className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl transition-all cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA: CHAT (WHATSAPP STYLE COM CANAIS E OPERADORES) */}
            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {!activeConversation ? (
                  // LISTAGEM UNIFICADA ESTILO WHATSAPP
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 border-b border-zinc-200 bg-zinc-50 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        {/* Pílulas de Filtro Rápido */}
                        <div className="flex items-center gap-1 bg-zinc-200/70 p-1 rounded-xl text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setChatFilter('all')}
                            className={cn(
                              'px-2.5 py-1 rounded-lg transition-all cursor-pointer',
                              chatFilter === 'all' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                            )}
                          >
                            Todos ({conversations.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setChatFilter('channels')}
                            className={cn(
                              'px-2.5 py-1 rounded-lg transition-all cursor-pointer',
                              chatFilter === 'channels' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                            )}
                          >
                            Canais ({channelsCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setChatFilter('operators')}
                            className={cn(
                              'px-2.5 py-1 rounded-lg transition-all cursor-pointer',
                              chatFilter === 'operators' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                            )}
                          >
                            Operadores ({operatorsCount})
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowNewGroupModal(true)}
                          className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                          title="Criar novo grupo ou canal"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Busca */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={searchContact}
                          onChange={(e) => setSearchContact(e.target.value)}
                          placeholder="Buscar canal, operador ou grupo..."
                          className="w-full bg-white border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
                      {filteredConversations.length === 0 ? (
                        <div className="text-center py-12 text-zinc-400 text-xs">
                          Nenhum canal ou operador encontrado.
                        </div>
                      ) : (
                        filteredConversations.map((conv) => (
                          <div
                            key={conv.id}
                            onClick={() => handleSelectConversation(conv)}
                            className="p-3 hover:bg-zinc-50 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                                  conv.is_group
                                    ? 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                                    : 'bg-zinc-900 text-white'
                                )}
                              >
                                {conv.is_protected ? (
                                  <Lock className="w-4 h-4 text-zinc-600" />
                                ) : conv.is_group ? (
                                  <Hash className="w-4 h-4 text-zinc-600" />
                                ) : (
                                  conv.name.charAt(0).toUpperCase()
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-xs font-bold text-zinc-900 truncate">
                                    {conv.name}
                                  </h4>
                                  {conv.is_protected && (
                                    <span className="text-[9px] bg-zinc-100 text-zinc-700 px-1 rounded-sm border border-zinc-200 font-bold">
                                      🔒 Senha
                                    </span>
                                  )}
                                  {conv.role === 'supervisor' && (
                                    <span className="text-[9px] bg-zinc-100 text-zinc-800 px-1 rounded-sm border border-zinc-200 font-bold">
                                      Supervisor
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                  {conv.description || (conv.is_group ? 'Canal Geral' : `Função: ${conv.role || 'Operador'}`)}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectConversation(conv);
                              }}
                              className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-900 hover:text-white text-zinc-700 text-[11px] font-bold rounded-lg transition-all border border-zinc-200 shrink-0 cursor-pointer"
                            >
                              {conv.is_group ? 'Entrar' : 'Conversar'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  // CONVERSA ATIVA
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveConversation(null)}
                          className="p-1 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-200 cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                            {activeConversation.name}
                            {activeConversation.is_protected && <Lock className="w-3 h-3 text-zinc-600" />}
                          </h4>
                          <p className="text-[10px] text-zinc-400">{activeConversation.description || 'Canal Criptografado'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-zinc-50/40">
                      {chatMessages.length === 0 ? (
                        <div className="text-center py-12 text-zinc-400 text-xs">
                          Nenhuma mensagem nesta conversa ainda. Envie a primeira mensagem abaixo!
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isMe = msg.sender_name === (currentUser?.displayName || currentUser?.username);
                          return (
                            <div key={msg.id} className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}>
                              <span className="text-[10px] text-zinc-400 px-1 mb-0.5 font-bold">
                                {msg.sender_name}
                              </span>
                              <div
                                className={cn(
                                  'p-2.5 rounded-2xl text-xs max-w-[85%] leading-relaxed shadow-2xs',
                                  isMe
                                    ? 'bg-zinc-900 text-white rounded-br-xs'
                                    : 'bg-white text-zinc-800 rounded-bl-xs border border-zinc-200'
                                )}
                              >
                                {msg.message_type === 'image' && msg.attachment_data && (
                                  <img src={msg.attachment_data} alt="Anexo" className="rounded-lg max-h-48 mb-1.5" />
                                )}
                                {msg.message_type === 'audio' && msg.attachment_data && (
                                  <audio controls src={msg.attachment_data} className="h-8 w-48 mb-1" />
                                )}
                                {msg.content && <p>{msg.content}</p>}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    {/* Input do Chat */}
                    <div className="p-2.5 bg-white border-t border-zinc-200 flex items-center gap-2 shrink-0">
                      {isRecording ? (
                        <div className="flex-1 flex items-center justify-between bg-zinc-100 px-3 py-1.5 rounded-xl border border-zinc-300 text-xs text-zinc-800">
                          <div className="flex items-center gap-2 animate-pulse font-bold">
                            <Mic className="w-4 h-4" />
                            <span>Gravando áudio ({recordingTime}s)...</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={cancelRecording} className="text-zinc-400 hover:text-zinc-700">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={stopRecording} className="p-1 bg-zinc-900 text-white rounded-lg">
                              <Square className="w-3 h-3 fill-current" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Digite sua mensagem..."
                            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          />
                          <button
                            type="button"
                            onClick={startRecording}
                            className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                            title="Gravar áudio"
                          >
                            <Mic className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleSendMessage}
                            disabled={!chatInput.trim() && !chatAttachment}
                            className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl transition-all cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA: ASSISTENTE IA */}
            {activeTab === 'ia' && (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-zinc-50/40">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn('flex flex-col', msg.sender === 'user' ? 'items-end' : 'items-start')}
                    >
                      <div
                        className={cn(
                          'p-3 rounded-2xl text-xs max-w-[90%] leading-relaxed shadow-2xs',
                          msg.sender === 'user'
                            ? 'bg-zinc-900 text-white font-medium rounded-br-xs'
                            : 'bg-white text-zinc-800 border border-zinc-200 rounded-bl-xs'
                        )}
                      >
                        {msg.text}
                      </div>

                      {msg.suggested_actions && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {msg.suggested_actions.map((act, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleSendAi(act)}
                              className="text-[10px] font-bold bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
                            >
                              ⚡ {act}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="p-3 bg-white rounded-2xl border border-zinc-200 text-xs text-zinc-500 flex items-center gap-2 shadow-2xs">
                      <Sparkles className="w-3.5 h-3.5 text-zinc-600 animate-spin" />
                      <span>Consultando informações...</span>
                    </div>
                  )}
                </div>

                <div className="p-2.5 bg-white border-t border-zinc-200 flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendAi()}
                    placeholder="Pergunte sobre estoque, lotes, compras..."
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendAi()}
                    disabled={aiLoading || !aiInput.trim()}
                    className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* MODAL: NOVO GRUPO COM SENHA */}
            {showNewGroupModal && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 w-full max-w-sm space-y-3 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-zinc-700" />
                      <span>Criar Novo Grupo de Chat</span>
                    </h4>
                    <button type="button" onClick={() => setShowNewGroupModal(false)} className="text-zinc-400 hover:text-zinc-700 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 block mb-1">Nome do Grupo *</label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Ex: Turno Noturno, Envase..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 block mb-1">Descrição (opcional)</label>
                    <input
                      type="text"
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                      placeholder="Objetivo do canal..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 flex items-center gap-1 mb-1">
                      <Lock className="w-3 h-3 text-zinc-600" />
                      <span>Proteger com Senha (opcional)</span>
                    </label>
                    <input
                      type="password"
                      value={newGroupPassword}
                      onChange={(e) => setNewGroupPassword(e.target.value)}
                      placeholder="Deixe em branco para canal público"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateGroup}
                    disabled={creatingGroup || !newGroupName.trim()}
                    className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    {creatingGroup ? 'Criando...' : 'Criar Grupo'}
                  </button>
                </div>
              </div>
            )}

            {/* MODAL: SENHA DO CANAL */}
            {unlockModalOpen && targetProtectedConv && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 w-full max-w-sm space-y-3 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-zinc-700" />
                      <span>Canal Protegido</span>
                    </h4>
                    <button type="button" onClick={() => setUnlockModalOpen(false)} className="text-zinc-400 hover:text-zinc-700 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-zinc-600">
                    O canal <strong className="text-zinc-900">{targetProtectedConv.name}</strong> requer senha de acesso:
                  </p>

                  <input
                    type="password"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                    placeholder="Digite a senha..."
                    autoFocus
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium"
                  />

                  {unlockError && <p className="text-xs text-zinc-900 font-bold">{unlockError}</p>}

                  <button
                    type="button"
                    onClick={handleVerifyPassword}
                    disabled={!unlockPassword}
                    className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Entrar no Canal
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
