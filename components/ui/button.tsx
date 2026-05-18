import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        default:   'bg-primary text-primary-foreground shadow-sm hover:bg-primary/88 active:scale-[0.98]',
        primary:   'bg-primary text-primary-foreground shadow-sm hover:bg-primary/88 active:scale-[0.98]',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground active:scale-[0.98]',
        outline:   'border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:scale-[0.98]',
        ghost:     'text-muted-foreground hover:bg-accent hover:text-foreground',
        danger:    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/88 active:scale-[0.98]',
        link:      'text-primary underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-8 px-3.5 py-1.5',
        sm:      'h-7 px-2.5 text-xs rounded',
        md:      'h-8 px-3.5 py-1.5',
        lg:      'h-10 px-5 text-sm',
        icon:    'h-8 w-8 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 size={13} className="animate-spin" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
