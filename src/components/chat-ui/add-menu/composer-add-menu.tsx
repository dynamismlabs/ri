'use client';
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
/**
 * The composer's +: one door for what you can bring into a message, so none of
 * it needs its own button or has to be known by its typed character. `@` and
 * `/` keep working as they always did. Their rows open the same menus.
 *
 * There is one row for files on every device. A phone's own sheet asks whether
 * to take a photo, pick one or browse files, so Ri never asks that first.
 *
 * `mentions` names what a surface can mention, so someone browsing sees nouns
 * rather than having to know what `@` reaches. `children` adds what it has
 * beyond the message. New and existing chats share their core context rows.
 * An existing chat adds actions through `ChatAddMenu`.
 */

import { useRef, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { AtSign, Paperclip, Plus, ScrollText, type LucideIcon } from 'lucide-react';
import type { ChatInputEditorHandle } from '@/components/chat/editor/chat-input-editor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/system/menu';

import { dismissOpenSuggestions } from '@/components/chat/editor/suggestion/escape-guard';
import { useTouchFirst } from '@/hooks/use-touch-first';
import { cn } from '@/lib/utils';

/** A row's icon, label and, where it has one, the character that does the same thing. */
export function AddMenuRow({ icon: Icon, typed, children, ...props }: ComponentProps<typeof DropdownMenuItem> & {
  icon: LucideIcon;
  typed?: string;
}) {
  return (
    <MenuAction kind="menu"  {...props}>
      <Icon className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {typed && <kbd className="font-mono text-xs text-muted-foreground">{typed}</kbd>}
    </MenuAction>
  );
}

export function ComposerAddMenu({ editor, onPick, disabled, skills, mentions, className, children }: {
  editor: RefObject<ChatInputEditorHandle | null>;
  /** Each picked file, one at a time. */
  onPick: (file: File) => void;
  disabled?: boolean;
  /** This composer has a `/` menu with something in it. */
  skills?: boolean;
  /** Rows that open the `@` menu narrowed to one kind, above the row that opens all of it. */
  mentions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const touchFirst = useTouchFirst();

  return (
    <>
      {/* Opening it closes a `/`, `@` or `#` menu already open over the composer, keeping what was typed. */}
      <DropdownMenu modal={false} onOpenChange={(open) => { if (open) dismissOpenSuggestions(); }}>
        <DropdownMenuTrigger asChild disabled={disabled}>

            <IconButton
              type="button"
              disabled={disabled}
              label="Add to this chat"
              tooltip="Add files and more"
              variant="ghost"
              size={touchFirst ? "touch" : "sm"}
              className={cn("flex items-center justify-center", className)}
            >
              <Plus size={16} />
            </IconButton>

        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          collisionPadding={8}
          className="w-60"
          onCloseAutoFocus={(event) => {
            // Back on this button, the next Enter would reopen the menu rather
            // than send. Where a row or a click sent focus stays as it is, and
            // a touch composer doesn't raise the keyboard for nothing.
            event.preventDefault();
            if (!touchFirst && document.activeElement === document.body) editor.current?.focus();
          }}
        >
          <AddMenuRow icon={Paperclip} onSelect={() => fileInput.current?.click()}>Files and photos</AddMenuRow>
          {mentions}
          <AddMenuRow icon={AtSign} typed="@" onSelect={() => editor.current?.openMentionMenu()}>{mentions ? 'Mention anything' : 'Mention'}</AddMenuRow>
          {skills && <AddMenuRow icon={ScrollText} typed="/" onSelect={() => editor.current?.openSkillMenu()}>Skills</AddMenuRow>}
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          for (const file of Array.from(event.target.files ?? [])) onPick(file);
          event.target.value = ''; // allow re-pick of the same file
        }}
      />
    </>
  );
}
