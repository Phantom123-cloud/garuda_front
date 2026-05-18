'use client';
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, description, children, width = 'w-[480px]' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'bg-card border border-border rounded-xl shadow-2xl',
            'max-h-[90vh] overflow-y-auto',
            'animate-slide-in',
            width,
          )}
          onInteractOutside={onClose}
          onEscapeKeyDown={onClose}
        >
          {(title || description) && (
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
              <div>
                {title && <Dialog.Title className="text-sm font-semibold text-foreground">{title}</Dialog.Title>}
                {description && <Dialog.Description className="text-xs text-muted-foreground mt-0.5">{description}</Dialog.Description>}
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-accent ml-4 flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="px-5 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
