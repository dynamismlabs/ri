'use client';
import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { useId, useRef, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';

import { Kbd } from '@/components/ui/kbd';
import { Tip } from '@/components/ui/tip';

interface TreeSearchBarProps {
  query: string;
  onChange: (q: string) => void;
  /** Optional "n of m" caption when filtering. Hidden when empty. */
  matchCount?: number;
  totalCount?: number;
  /** A shortcut hint shown while the field is empty, e.g. "⌘P". */
  shortcut?: string;
}

/**
 * Search field at the top of the tree, above the Changes only filter.
 * Substring match on the full path — fuzzy ranking would be nicer for
 * a flat command-palette but adds little here, where the tree itself
 * already groups by directory and the user is mostly trying to jump to
 * a known basename or folder segment.
 *
 * Esc clears + blurs so the input doesn't trap keyboard focus. Click on
 * the magnifier focuses the input (cheap one-handed access for users
 * navigating from the rail without leaving the keyboard).
 */
export function TreeSearchBar({
  query,
  onChange,
  matchCount,
  totalCount,
  shortcut,
}: TreeSearchBarProps) {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const inputRef = useRef<HTMLInputElement>(null);
  const matchDescriptionId = useId();

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        onChange('');
      } else {
        inputRef.current?.blur();
      }
    }
  };

  const showingCount =
    !!query && typeof matchCount === 'number' && typeof totalCount === 'number';

  const matchSummary = showingCount
    ? `${matchCount} match${matchCount === 1 ? '' : 'es'} of ${totalCount} files`
    : '';

  return (
    <>
      <Field
        ref={inputRef}
        // Go to file (⌘P) focuses this from the execution workbench.
        data-tree-search=""
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        placeholder="Search files"
        aria-label="Search files"
        aria-describedby={showingCount ? matchDescriptionId : undefined}
        className="@container/tree-search flex-1 min-w-0"
        size={compactFieldSize}
        leading={<Search aria-hidden />}
        trailing={
          <>
            {shortcut && !query && (
              <Kbd className="@max-[200px]/tree-search:hidden">{shortcut}</Kbd>
            )}
            {showingCount && (
              <Tip label={matchSummary}>
                <span className="shrink-0 tabular-nums @max-[180px]/tree-search:hidden">
                  {matchCount}/{totalCount}
                </span>
              </Tip>
            )}
            {query && (
              <IconButton
                type="button"
                onClick={() => {
                  onChange('');
                  inputRef.current?.focus();
                }}
                label="Clear search"
                tooltip="Clear search"
                shortcut="Esc"
                variant="ghost"
                size={compactFieldSize}
                focus="inside"
                className="shrink-0 inline-flex items-center justify-center"
              >
                <X size={11} />
              </IconButton>
            )}
          </>
        }
      />
      <span id={matchDescriptionId} className="sr-only">
        {matchSummary}
      </span>
    </>
  );
}
