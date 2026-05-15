import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Button } from './button.js';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-sheet-overlay" />
      <DialogPrimitive.Content className={cn('ui-sheet-content', className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-sheet-header', props.className)} />;
}

export function SheetTitle(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title {...props} className={cn('ui-sheet-title', props.className)} />;
}

export function SheetDescription(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description {...props} className={cn('ui-sheet-description', props.className)} />;
}

export function SheetBody(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-sheet-body', props.className)} />;
}

export function SheetX() {
  return (
    <DialogPrimitive.Close asChild>
      <Button variant="icon" size="icon" aria-label="关闭">
        <X size={18} />
      </Button>
    </DialogPrimitive.Close>
  );
}
