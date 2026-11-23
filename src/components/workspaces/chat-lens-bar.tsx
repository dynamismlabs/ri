'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { SegmentedList, SegmentedRoot, type SegmentOption } from '@/components/system/segmented-control';

const Lens = createContext<string | null>(null);
/** One chat list filtered by a choice, with counts before a tap. */
export function ChatLenses<T extends string>({
  value,
  onChange,
  className,
  children,
}: {
  value: T;
  onChange: (next: T) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Lens.Provider value={value}>
      <SegmentedRoot mode="choice" value={value} onChange={onChange} className={className}>
        {children}
      </SegmentedRoot>
    </Lens.Provider>
  );
}
export type ChatLensOption<T extends string> = SegmentOption<T>;
/** Touch lenses fill their existing phone row. All drawing belongs to the system. */
export function ChatLensBar<T extends string>({
  options,
  label,
  size = 'compact',
  className,
}: {
  options: ReadonlyArray<ChatLensOption<T>>;
  label: string;
  size?: 'touch' | 'compact';
  className?: string;
}) {
  return (
    <SegmentedList
      options={options.map((option) => ({ ...option, countStyle: 'badge' as const }))}
      ariaLabel={label}
      size={size}
      stretch={size === 'touch'}
      className={className}
    />
  );
}
/** Only the chosen list mounts, retaining the previous filter's lifecycle. */
export function ChatLensPanel<T extends string>({ value, className, children }: { value: T; className?: string; children: ReactNode }) {
  const selected = useContext(Lens);
  return selected === value ? <div data-chat-lens-results className={className}>{children}</div> : null;
}
