'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogOverlay(props: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      {...props}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,15,23,.3)',
        zIndex: 80,
        ...props.style,
      }}
    />
  );
}

export function DialogContent({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Content
      {...props}
      style={{ position: 'fixed', zIndex: 90, ...props.style }}
    >
      {children}
    </DialogPrimitive.Content>
  );
}
