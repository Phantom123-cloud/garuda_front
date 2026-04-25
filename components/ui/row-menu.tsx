'use client';
import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Lock, Unlock, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Primitives ───────────────────────────────────────────────────────────────

export function DropdownContent({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Content
      align="end"
      sideOffset={4}
      className={cn(
        'z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg',
        'data-[state=open]:animate-fade-in',
        'py-1',
      )}
    >
      {children}
    </DropdownMenu.Content>
  );
}

export function DropdownItem({
  children,
  onClick,
  variant = 'default',
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  icon?: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer outline-none select-none transition-colors',
        'focus:bg-accent',
        variant === 'danger'
          ? 'text-destructive focus:text-destructive'
          : 'text-foreground',
      )}
    >
      {icon && <span className="text-muted-foreground flex-shrink-0 [.text-destructive_&]:text-destructive">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  );
}

export function DropdownSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}

// ─── Ready-made RowMenu for ACTIVE/BLOCKED entities ──────────────────────────

interface RowMenuProps {
  status: string;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  deleteLabel?: string;
}

export function RowMenu({ status, onToggle, onDelete, onEdit, deleteLabel = 'Удалить' }: RowMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground">
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownContent>
          {onEdit && (
            <>
              <DropdownItem icon={<Pencil size={13} />} onClick={onEdit}>
                Редактировать
              </DropdownItem>
              <DropdownSeparator />
            </>
          )}
          <DropdownItem
            icon={status === 'ACTIVE' ? <Lock size={13} /> : <Unlock size={13} />}
            onClick={onToggle}
          >
            {status === 'ACTIVE' ? 'Заблокировать' : 'Разблокировать'}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={onDelete}
          >
            {deleteLabel}
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
