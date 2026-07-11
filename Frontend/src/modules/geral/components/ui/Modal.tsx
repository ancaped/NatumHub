import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'max';
  children: React.ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
}: ModalProps) {
  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; // Lock background scrolling
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = ''; // Unlock scrolling
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
    '3xl': 'max-w-6xl',
    '4xl': 'max-w-7xl',
    '5xl': 'max-w-8xl',
    max: 'max-w-[95vw]',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 no-print">
      
      {/* Click outside to close */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />
      
      {/* Modal Box */}
      <div 
        className={cn(
          "bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh] text-left relative z-10 animate-in fade-in zoom-in-95 duration-200 border border-zinc-200",
          sizeClasses[size]
        )}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-zinc-250 bg-zinc-50 flex justify-between items-center shrink-0">
          <div className="truncate pr-4">
            <h3 className="font-extrabold text-zinc-900 text-base tracking-tight truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-150 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {children}
        </div>
      </div>

    </div>
  );
}
