'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  children,
  sideOffset = 10,
  align = 'end',
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={16}
        {...props}
        style={{
          zIndex: 70,
          borderRadius: 14,
          background: 'rgba(17,24,38,.97)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,.14)',
          boxShadow: '0 30px 80px rgba(0,0,0,.6)',
          color: 'var(--text)',
          ...props.style,
        }}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
