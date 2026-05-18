import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-primary/15 text-primary border border-primary/20',
        secondary:   'bg-secondary text-secondary-foreground border border-border',
        success:     'bg-green-500/10 text-green-400 border border-green-500/20',
        warning:     'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
        destructive: 'bg-destructive/10 text-red-400 border border-destructive/20',
        muted:       'bg-muted text-muted-foreground border border-border',
        outline:     'border border-border text-foreground',
        // Legacy variants for backward compatibility
        active:      'bg-green-500/10 text-green-400 border border-green-500/20',
        blocked:     'bg-destructive/10 text-red-400 border border-destructive/20',
        blue:        'bg-primary/15 text-primary border border-primary/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full',
        variant === 'success' || variant === 'active' ? 'bg-green-400' :
        variant === 'warning' ? 'bg-yellow-400' :
        variant === 'destructive' || variant === 'blocked' ? 'bg-red-400' :
        'bg-primary'
      )} />}
      {children}
    </span>
  );
}

// StatusBadge for ACTIVE/BLOCKED/PENDING
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    ACTIVE:   { variant: 'success', label: 'Активен' },
    STOPPED:  { variant: 'warning', label: 'Остановлен' },
    BLOCKED:  { variant: 'destructive', label: 'Заблокирован' },
    INACTIVE: { variant: 'muted', label: 'Неактивен' },
    PENDING:  { variant: 'warning', label: 'Ожидает' },
    PAUSED:   { variant: 'warning', label: 'Пауза' },
  };
  const cfg = map[status] ?? { variant: 'secondary' as BadgeProps['variant'], label: status };
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
}

// Legacy named exports for backward compatibility
export function OperatorStatusBadge({ status }: { status: 'ACTIVE' | 'BLOCKED' }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'destructive'} dot>
      {status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}
    </Badge>
  );
}
