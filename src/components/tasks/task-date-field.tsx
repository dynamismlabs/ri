'use client';

import { Button } from '@/components/system/button';
import { ChipButton } from '@/components/system/chip-button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useRef, useState, type ReactElement, type SyntheticEvent } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Field } from '@/components/system/field';
import { useViewportTier } from '@/hooks/use-viewport-tier';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/system/popover';
import { parseTypedDate } from '@/lib/date-input';
import { describeLocalDate, formatLocalDate, isPastDate, parseLocalDate, toDateOnly } from '@/lib/dates';
import { todayLocalDate } from '@/lib/deck/date';

const FULL_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** Clicks inside reach the row behind through React's portal bubbling, and a held touch would start dragging it. */
function keepFromRow(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * The one way to set a task date: type it or pick it. `children` is the chip or
 * field that opens it. A picked day saves at once. Typed text saves on Enter or
 * on leaving, and Escape leaves everything as it was.
 */
export function TaskDatePicker({ label, value, onChange, children, open, onOpenChange }: {
  label: string; value: string | null | undefined; onChange: (date: string | null) => void; children: ReactElement;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* Mounted per opening, so a new opening starts from the saved date. */}
      {isOpen && <DatePanel label={label} value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </Popover>
  );
}

function DatePanel({ label, value, onChange, onClose }: {
  label: string; value: string | null | undefined; onChange: (date: string | null) => void; onClose: () => void;
}) {
  const phone = useViewportTier() === 'phone';
  const saved = toDateOnly(value);
  const initial = formatLocalDate(saved, FULL_DATE) ?? '';
  const [text, setText] = useState(initial);
  const [month, setMonth] = useState(() => parseLocalDate(saved) ?? new Date());
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  const edited = text !== initial;
  const empty = !text.trim();
  const picked = edited ? parseTypedDate(text) : saved;
  const unreadable = edited && !empty && !picked;

  const save = (next: string | null) => {
    if (settled.current) return;
    settled.current = true;
    if (next !== saved) onChange(next);
  };
  const finish = (next: string | null) => {
    save(next);
    onClose();
  };

  return (
    <PopoverContent padding="sm"
      align="start"
      className="w-auto"
      data-cancel-on-escape=""
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        // On a phone the keyboard would cover the calendar, and tapping a day is the quick way there.
        if (window.matchMedia('(pointer: coarse)').matches) return;
        input.current?.focus();
        input.current?.select();
      }}
      onInteractOutside={() => {
        if (!edited || unreadable) return;
        save(empty ? null : picked);
      }}
    >
      <div onClick={keepFromRow} onTouchStart={keepFromRow} className="flex flex-col gap-2">
        <Field
          inlineMessage
          error={unreadable ? 'Not a date' : undefined}
          description={edited && !empty && !unreadable ? describeLocalDate(picked!) : undefined}
          ref={input}
          aria-label={label}
          aria-invalid={unreadable}
          autoComplete="off"
          placeholder="Type a date, like fri"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const next = parseTypedDate(event.target.value);
            if (next) setMonth(parseLocalDate(next)!);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (empty) finish(null);
            else if (picked) finish(picked);
          }}
        />
        <Calendar
          mode="single"
          required
          selected={parseLocalDate(picked) ?? undefined}
          month={month}
          onMonthChange={setMonth}
          onSelect={(day) => finish(todayLocalDate(day))}
          className="p-0"
        />
        {saved && (
          <Button
            type="button"
            onClick={() => finish(null)}
            variant="secondary"
            size="sm"
          >
            Clear date
          </Button>
        )}
      </div>
    </PopoverContent>
  );
}

/** A task date as a labeled field, for the task page's properties. `emptyLabel` says what no date means here. */
export function TaskDateField({ label, value, onChange, highlightOverdue = false, emptyLabel }: {
  label: string; value: string | null; onChange: (date: string | null) => void; highlightOverdue?: boolean; emptyLabel?: string;
}) {
  const shown = formatLocalDate(value, FULL_DATE);
  return (
    <TaskDatePicker label={label} value={value} onChange={onChange}>
      <ChipButton
        type="button"
        aria-label={`${label}: ${shown ?? emptyLabel?.toLowerCase() ?? 'not set'}`}
        variant="secondary"
        size="compact"
        tone="status"
        status={highlightOverdue && isPastDate(value) ? "danger" : "neutral"}
        className="inline-flex w-fit items-center gap-1.5"
      >
        <CalendarIcon size={12} />
        {shown ?? emptyLabel ?? 'Set date'}
      </ChipButton>
    </TaskDatePicker>
  );
}
