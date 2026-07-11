import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: {
    value: string;
    type: 'up' | 'down' | 'neutral';
  };
  onClick?: () => void;
  className?: string;
}

export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  onClick,
  className,
}: StatCardProps) {
  const isClickable = !!onClick;
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm transition-all text-left flex flex-col justify-between h-36 relative select-none",
        isClickable ? "hover:border-zinc-400 hover:shadow-md cursor-pointer active:scale-[0.99]" : "",
        className
      )}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-0.5 max-w-[70%]">
          <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-widest block truncate">
            {title}
          </span>
          <span className="text-2xl font-black text-zinc-900 tracking-tight block truncate mt-1">
            {value}
          </span>
        </div>
        
        {/* Icon wrapper */}
        <div className="bg-zinc-50 border border-zinc-150 text-zinc-700 p-2.5 rounded-xl">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <p className="text-xs text-zinc-500 font-medium truncate max-w-[70%]">
          {description}
        </p>

        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
              trend.type === 'up' && "bg-emerald-50 text-emerald-700 border-emerald-250",
              trend.type === 'down' && "bg-rose-50 text-rose-700 border-rose-250",
              trend.type === 'neutral' && "bg-zinc-50 text-zinc-600 border-zinc-250"
            )}
          >
            {trend.type === 'up' && <ArrowUpRight className="h-3 w-3 shrink-0" />}
            {trend.type === 'down' && <ArrowDownRight className="h-3 w-3 shrink-0" />}
            {trend.type === 'neutral' && <Minus className="h-3 w-3 shrink-0" />}
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
