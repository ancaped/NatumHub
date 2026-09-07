import React, { type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { HUB_FOCUS } from './hub';
import { cn } from '../../lib/utils';

export interface HubCardProps {
  title: string;
  description: string;
  cta: string;
  icon: ReactNode;
  onClick: () => void;
}

export function HubCard({ title, description, cta, icon, onClick }: HubCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative bg-white border border-zinc-200 hover:border-zinc-400 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-64 w-full cursor-pointer',
        HUB_FOCUS
      )}
    >
      <div className="space-y-4">
        <div className="bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit group-hover:bg-zinc-900 group-hover:text-white transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-bold text-zinc-900">{title}</h3>
          <p className="text-sm text-zinc-500 mt-1">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 mt-4 group-hover:translate-x-1 transition-transform">
        {cta} <ArrowRight className="h-4 w-4" />
      </div>
    </button>
  );
}
