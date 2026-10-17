import React from 'react';
import { cn } from '../lib/utils';

export interface NexusIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  fillColor?: string;
}

/**
 * Ícone oficial SVG Nexus (N Minimalista Moderno).
 */
export function NexusIcon({
  size = 24,
  className,
  fillColor = 'currentColor',
  ...props
}: NexusIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn('shrink-0 transition-transform', className)}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M 140 120
           C 140 106 150 96 164 96
           L 196 96
           C 207 96 216 102 222 112
           L 326 294
           L 326 120
           C 326 106 336 96 350 96
           L 372 96
           C 386 96 396 106 396 120
           L 396 392
           C 396 406 386 416 372 416
           L 340 416
           C 329 416 320 410 314 400
           L 210 218
           L 210 392
           C 210 406 200 416 186 416
           L 164 416
           C 150 416 140 406 140 392
           Z"
        fill={fillColor}
      />
    </svg>
  );
}

export interface NexusLogoProps {
  variant?: 'icon' | 'badge' | 'full';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showVersion?: boolean;
  subtitle?: string;
  dark?: boolean;
}

/**
 * Componente oficial de identidade visual Nexus.
 */
export default function NexusLogo({
  variant = 'full',
  size = 'md',
  className,
  showVersion = false,
  subtitle,
  dark = false,
}: NexusLogoProps) {
  const iconSizes = {
    sm: 18,
    md: 24,
    lg: 34,
    xl: 48,
  };

  const badgePadding = {
    sm: 'p-1.5 rounded-lg',
    md: 'p-2 rounded-xl',
    lg: 'p-3 rounded-2xl',
    xl: 'p-4 rounded-3xl',
  };

  const titleSizes = {
    sm: 'text-sm font-black tracking-tight',
    md: 'text-base font-black tracking-tight',
    lg: 'text-xl font-black tracking-tight',
    xl: 'text-3xl font-black tracking-tight',
  };

  const currentIconSize = iconSizes[size];

  if (variant === 'icon') {
    return (
      <NexusIcon
        size={currentIconSize}
        className={cn(dark ? 'text-white' : 'text-zinc-900', className)}
      />
    );
  }

  const badgeNode = (
    <div
      className={cn(
        'flex items-center justify-center shadow-xs shrink-0',
        dark ? 'bg-white text-zinc-950' : 'bg-zinc-900 text-white',
        badgePadding[size]
      )}
    >
      <NexusIcon size={currentIconSize} fillColor="currentColor" />
    </div>
  );

  if (variant === 'badge') {
    return <div className={cn('inline-flex', className)}>{badgeNode}</div>;
  }

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      {badgeNode}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              titleSizes[size],
              dark ? 'text-white' : 'text-zinc-900',
              'uppercase'
            )}
          >
            Nexus
          </span>
          {showVersion && (
            <span
              className={cn(
                'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border',
                dark
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              )}
            >
              0.1b
            </span>
          )}
        </div>
        {subtitle && (
          <p
            className={cn(
              'text-[9px] font-bold uppercase tracking-wider -mt-0.5 truncate',
              dark ? 'text-zinc-400' : 'text-zinc-500'
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
