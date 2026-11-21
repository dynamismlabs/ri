'use client';

import { IconButton } from '@/components/system/icon-button';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Layers3, Maximize2, NotebookPen, X } from 'lucide-react';
import { EntitySheet } from '@/components/entities/entity-sheet';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useHomeStorageScope, useOptionalHomeContext } from '@/components/home/home-context';
import { composerTarget } from '@/components/chat/editor/composer-focus';
import { HOTKEYS, matchesHotkey } from '@/constants/commands';
import { useViewportTier } from '@/hooks/use-viewport-tier';
import { useDragResize } from '@/hooks/use-drag-resize';
import { homeStorageIdentity } from '@/lib/home/document-scope';
import {
  isScratchpadInColumn, isScratchpadSheetOpen, nextDeckBesideAction, nextScratchpadAction, requestScratchpadFocus,
  setBesideView, setScratchpadColumnOpen, setScratchpadSheetOpen, useBesideView, useScratchpadColumnOpen, useScratchpadSheetOpen,
} from '@/lib/client/scratchpad-open';
import { cn } from '@/lib/utils';
import { ScratchpadPad } from './scratchpad-pad';

/**
 * Where the scratchpad shows (docs/scratchpad.md): a column at the right of
 * every screen on a wide window, a sheet over the page on a phone or tablet.
 * On a wide window the same column can show the deck instead ("The deck
 * beside"), so it stays in view from a chat or an agent. Both are private
 * planning, so a team's Home has neither.
 */

export function useScratchpadAvailable(): boolean {
  const home = useOptionalHomeContext();
  return !!home && home.capabilities.privatePlanning !== false;
}

/** Where focus was when the shortcut took it into the pad, to go back to. */
let returnTo: HTMLElement | null = null;

/** The pad or the deck, in the column or in a slideout. */
const BESIDE_SELECTOR = '[data-scratchpad], [data-deck-beside], [data-beside-column]';

function padHasFocus(): boolean {
  return !!document.activeElement?.closest('[data-scratchpad]');
}

function besideHasFocus(): boolean {
  return !!document.activeElement?.closest(BESIDE_SELECTOR);
}

function rememberFocus() {
  const active = document.activeElement;
  returnTo = active instanceof HTMLElement && active !== document.body && !active.closest(BESIDE_SELECTOR) ? active : null;
}

/** Back to where you were before the pad: that element, else the chat on screen. */
function goBack() {
  const to = returnTo;
  returnTo = null;
  if (to?.isConnected) { to.focus(); return; }
  const composer = composerTarget();
  if (composer) { composer.focus(); return; }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export function openScratchpad(wide: boolean) {
  rememberFocus();
  if (wide) { setBesideView('scratchpad'); setScratchpadColumnOpen(true); }
  else setScratchpadSheetOpen(true);
  requestScratchpadFocus();
}

/** Closes the column (whichever view it shows) or the sheet. */
export function closeScratchpad(wide: boolean) {
  const inside = besideHasFocus();
  if (wide) setScratchpadColumnOpen(false);
  else setScratchpadSheetOpen(false);
  if (inside) goBack();
}

/** Shows the deck in the column beside the page. Focus stays where it is. */
export function showDeckBeside() {
  if (padHasFocus()) goBack();
  setBesideView('deck');
  setScratchpadColumnOpen(true);
}

/** ⌘⇧J: to the pad's caret, and back (`nextScratchpadAction`). From the deck beside, it switches the column to the pad. */
export function runScratchpadShortcut(wide: boolean) {
  const open = wide ? isScratchpadInColumn() : isScratchpadSheetOpen();
  const action = nextScratchpadAction(open, padHasFocus(), wide);
  if (action === 'open') openScratchpad(wide);
  else if (action === 'focus') { rememberFocus(); requestScratchpadFocus(); }
  else if (action === 'return') goBack();
  else closeScratchpad(wide);
}

/** Mounted once on the dashboard. */
export function ScratchpadShortcut() {
  const available = useScratchpadAvailable();
  const tier = useViewportTier();
  useEffect(() => {
    if (!available) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !matchesHotkey(e, HOTKEYS.scratchpad)) return;
      e.preventDefault();
      runScratchpadShortcut(tier === 'desktop');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [available, tier]);
  return null;
}

/**
 * The column beside every screen on a wide window: the pad, or the deck the
 * dashboard passes in. It stays open across navigation and reloads.
 */
export function ScratchpadColumn({ deck }: { deck?: ReactNode }) {
  const available = useScratchpadAvailable();
  const open = useScratchpadColumnOpen();
  return available && open ? <OpenScratchpadColumn deck={deck} /> : null;
}

function OpenScratchpadColumn({ deck }: { deck?: ReactNode }) {
  const view = useBesideView();
  const showDeck = view === 'deck' && !!deck;
  // Both stay mounted while the column is open, so switching keeps the pad's
  // caret, undo and unsent lines, and the deck's scroll, filters and half-typed add.
  const [deckMounted, setDeckMounted] = useState(showDeck);
  const [expanded, setExpanded] = useState(false);
  const [deckExpanded, setDeckExpanded] = useState(false);
  // Each view takes the column from the other, so the other's slideout folds back in.
  if (showDeck && (!deckMounted || expanded)) { setDeckMounted(true); setExpanded(false); }
  if (!showDeck && deckExpanded) setDeckExpanded(false);
  const editor = useRef<Editor | null>(null);
  const focusChat = useRef(false);
  const deckExpandButton = useRef<HTMLButtonElement | null>(null);
  const storageScope = useHomeStorageScope();
  const { size: width, isResizing, handleResizeStart } = useDragResize({
    edge: 'left', min: 420, max: 1400, defaultSize: 960,
    storageKey: homeStorageIdentity('ri.scratchpad-slideout.width', storageScope),
  });
  const deckResize = useDragResize({
    edge: 'left', min: 420, max: 1400, defaultSize: 960,
    storageKey: homeStorageIdentity('ri.deck-slideout.width', storageScope),
  });
  // This component opens only after hydration. Keep one portal target and
  // move it between the column and the sheet, so the editor never remounts.
  const [padContainer] = useState(() => {
    const element = document.createElement('div');
    element.className = 'flex h-full min-h-0 min-w-0 flex-1 flex-col';
    return element;
  });
  const mountPad = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    element.appendChild(padContainer);
    queueMicrotask(() => {
      // Restore ProseMirror's selection synchronously after moving its DOM.
      // A delayed focus lets the sheet's focus boundary replace an AllSelection.
      if (!focusChat.current) editor.current?.view.focus();
    });
  }, [padContainer]);
  const collapse = () => setExpanded(false);
  // The deck moves between the column and its slideout the same way, so its
  // filters, half-typed add and loaded deck carry over.
  const [deckContainer] = useState(() => {
    const element = document.createElement('div');
    element.className = 'flex h-full min-h-0 min-w-0 flex-1 flex-col';
    return element;
  });
  const mountDeck = useCallback((element: HTMLElement | null) => {
    if (element) element.appendChild(deckContainer);
  }, [deckContainer]);
  const collapseDeck = () => setDeckExpanded(false);
  return (
    <>
      <aside aria-label={showDeck ? 'Deck beside' : 'Scratchpad'} data-beside-column
        className="flex min-h-0 w-[340px] shrink-0 flex-col border-l border-border">
        <div ref={expanded ? undefined : mountPad} hidden={showDeck} className="flex min-h-0 flex-1 flex-col" />
        {deckMounted && <div ref={deckExpanded ? undefined : mountDeck} hidden={!showDeck} className="flex min-h-0 flex-1 flex-col" />}
      </aside>
      <EntitySheet open={deckExpanded} label="Deck" width={deckResize.size} resizing={deckResize.isResizing}
        onClose={collapseDeck} showCloseButton={false}
        onCloseAutoFocus={(e) => { e.preventDefault(); deckExpandButton.current?.focus(); }}>
        <div role="separator" aria-label="Resize the deck" aria-orientation="vertical"
          className={cn('relative hidden w-1.5 shrink-0 cursor-col-resize bg-background transition-colors hover:bg-primary/20 md:block', deckResize.isResizing && 'bg-primary/30')}
          onPointerDown={deckResize.handleResizeStart} style={{ touchAction: 'none' }}>
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
        <div ref={deckExpanded ? mountDeck : undefined} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" />
      </EntitySheet>
      {deckMounted && createPortal(
        <div data-deck-beside className="flex h-full min-h-0 flex-col bg-background">
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/50 pl-4 pr-2">
            <Layers3 size={14} className="shrink-0 text-muted-foreground" />
            <h2 className="mr-auto shrink-0 text-xs font-semibold">Deck</h2>
            {!deckExpanded && (
                <IconButton
                  type="button"
                  ref={deckExpandButton}
                  onClick={() => setDeckExpanded(true)}
                  label="Expand the deck"
                  tooltip="Open in a slideout"
                  variant="ghost"
                  size="sm"
                  className="flex shrink-0 items-center justify-center"
                >
                  <Maximize2 size={14} />
                </IconButton>
            )}

              <IconButton
                type="button"
                onClick={deckExpanded ? collapseDeck : () => closeScratchpad(true)}
                label="Close the deck beside"
                tooltip="Close"
                variant="ghost"
                size="sm"
                className="flex shrink-0 items-center justify-center"
              >
                <X size={15} />
              </IconButton>

          </header>
          <div className="min-h-0 flex-1">{deck}</div>
        </div>, deckContainer,
      )}
      <EntitySheet open={expanded} label="Scratchpad" width={width} resizing={isResizing}
        onClose={collapse} showCloseButton={false}
        onOpenAutoFocus={(e) => { e.preventDefault(); editor.current?.commands.focus(); }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (focusChat.current) { focusChat.current = false; composerTarget()?.focus(); }
          else editor.current?.commands.focus();
        }}>
        <div role="separator" aria-label="Resize the scratchpad" aria-orientation="vertical"
          className={cn('relative hidden w-1.5 shrink-0 cursor-col-resize bg-background transition-colors hover:bg-primary/20 md:block', isResizing && 'bg-primary/30')}
          onPointerDown={handleResizeStart} style={{ touchAction: 'none' }}>
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
        <div ref={expanded ? mountPad : undefined} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" />
      </EntitySheet>
      {createPortal(
        <div className="flex h-full min-h-0 flex-col"
          onKeyDown={(e) => {
            if (expanded) {
              if (matchesHotkey(e.nativeEvent, HOTKEYS.scratchpad)) { e.preventDefault(); collapse(); }
              return;
            }
            if (!matchesHotkey(e.nativeEvent, HOTKEYS.scratchpadClose)) return;
            if (e.target instanceof Element && e.target.closest('[data-cancel-on-escape]')) return;
            e.preventDefault();
            closeScratchpad(true);
          }}>
          <ScratchpadPad expanded={expanded} onEditor={(value) => { editor.current = value; }}
            onExpand={expanded ? undefined : () => setExpanded(true)}
            onClose={expanded ? collapse : () => closeScratchpad(true)} closeShortcut={HOTKEYS.scratchpadClose.label}
            onSendToChat={expanded ? () => { focusChat.current = true; collapse(); } : undefined} />
        </div>, padContainer,
      )}
    </>
  );
}

/** The pad over the page on a phone or tablet. */
export function ScratchpadSheet() {
  const available = useScratchpadAvailable();
  const open = useScratchpadSheetOpen();
  const tier = useViewportTier();
  if (!available) return null;
  return (
    <Sheet open={open && tier !== null && tier !== 'desktop'} onOpenChange={(next) => { if (!next) setScratchpadSheetOpen(false); }}>
      <SheetContent side="right" showCloseButton={false} className="gap-0 p-0 data-[side=right]:sm:max-w-md"
        // The pad's editor takes the caret itself once its text has loaded.
        onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetTitle className="sr-only">Scratchpad</SheetTitle>
        <div className="flex min-h-0 flex-1 flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <ScratchpadPad onClose={() => setScratchpadSheetOpen(false)} closeShortcut={HOTKEYS.scratchpadClose.label} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Opens or closes the pad: in the top bar on a wide window or tablet, beside search on a phone. */
export function ScratchpadButton({ variant = 'hud' }: { variant?: 'hud' | 'phone' }) {
  const available = useScratchpadAvailable();
  const tier = useViewportTier();
  const columnOpen = useScratchpadColumnOpen();
  const view = useBesideView();
  const sheetOpen = useScratchpadSheetOpen();
  const wide = tier === 'desktop';
  // A column showing the deck switches to the pad.
  const open = wide ? columnOpen && view === 'scratchpad' : sheetOpen;
  if (!available) return null;
  const button = (
    <IconButton
      type="button"
      aria-pressed={open}
      onClick={() => (open ? closeScratchpad(wide) : openScratchpad(wide))}
      label="Scratchpad"
      shortcut={variant === 'phone' ? undefined : HOTKEYS.scratchpad.label}
      variant={variant === 'phone' ? 'secondary' : 'ghost'}
      size={variant === 'phone' ? "touch" : "sm"}
      className={cn("flex items-center justify-center", (variant === 'phone' ? "shrink-0" : ''))}
    >
      <NotebookPen size={variant === 'phone' ? 16 : 14} />
    </IconButton>
  );
  return button;
}

/**
 * Shows the deck in the column beside the page, or closes it there. Wide
 * windows only: a phone or tablet has the deck as a tab of its own.
 */
export function DeckBesideButton() {
  const available = useScratchpadAvailable();
  const tier = useViewportTier();
  const columnOpen = useScratchpadColumnOpen();
  const view = useBesideView();
  if (!available || tier !== 'desktop') return null;
  const open = columnOpen && view === 'deck';
  return (
      <IconButton
        type="button"
        aria-pressed={open}
        onClick={() => (nextDeckBesideAction(columnOpen, view) === 'close' ? closeScratchpad(true) : showDeckBeside())}
        label="Deck"
        tooltip="Deck beside this screen"
        variant="ghost"
        size="sm"
        className="flex items-center justify-center"
      >
        <Layers3 size={14} />
      </IconButton>
  );
}
