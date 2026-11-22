"use client";

import { PopoverPrimitive } from '@/components/system/popover';
import { Button } from '@/components/system/button';
import { useCallback, useEffect, useRef, useState } from "react";

import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

interface EmojiPickerAction {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  tone?: 'destructive';
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  children: React.ReactNode;
  /** Other ways to set the icon, shown above the emoji grid (Upload image, Remove). Each closes the picker. */
  actions?: EmojiPickerAction[];
}

/**
 * Emoji picker that wraps emoji-mart's `Picker` in a Radix Popover.
 *
 * Why Radix Popover instead of a hand-rolled portal:
 *
 *   1. **Focus / pointer-events coexistence with Radix Dialog.** When
 *      this picker opens inside a Dialog, react-remove-scroll sets
 *      `pointer-events: none` on `<body>`; that cascades into a vanilla
 *      `createPortal(...)` and silently disables typing in the search
 *      input. The popover content carries `pointer-events-auto` to
 *      override the cascade for its subtree.
 *
 *   2. **Collision detection.** Floating UI flips above the trigger when
 *      there isn't room below and clamps to the viewport edge.
 *
 *   3. **Outside-click + Escape** are handled by Radix DismissableLayer.
 *
 * The `onSelect` callback is ref-stabilized so emoji-mart's underlying
 * custom-element wrapper doesn't churn its `componentWillReceiveProps`
 * pipeline on every parent render.
 */
export function EmojiPicker({ onSelect, children, actions }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const handleSelect = useCallback((emoji: { native: string }) => {
    onSelectRef.current(emoji.native);
    setOpen(false);
  }, []);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content padding="none"
          side="bottom"
          align="center"
          sideOffset={8}
          avoidCollisions
          collisionPadding={16}
          // Radix would otherwise pull focus to the Content root; emoji-mart
          // owns its own focus and we want the search input focused inside
          // the shadow root, not the popover wrapper.
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Don't bubble the picker's scroll/touch through to a parent
          // dialog body.
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          // Force pointer-events on. When this picker opens inside a Radix
          // Dialog, react-remove-scroll sets `pointer-events: none` on the
          // body to lock the page; the value cascades to descendants
          // (including our portal target) and silently kills typing in the
          // search input. `pointer-events-auto` here re-enables interaction
          // for the picker subtree.
          className="z-[60] outline-none pointer-events-auto"
        >
          {actions && actions.length > 0 && (
            <div className="mb-1.5 flex gap-1 rounded-lg border border-border bg-popover p-1 shadow-md">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                  variant="ghost"
                  size="xs"
                  tone="danger"
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          <Picker
            data={data}
            onEmojiSelect={handleSelect}
            theme="dark"
            previewPosition="none"
            skinTonePosition="search"
            set="native"
            autoFocus
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
