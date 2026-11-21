'use client';
import { MenuAction } from '@/components/system/menu-action';

import { ChipButton } from '@/components/system/chip-button';
import { Columns3 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export function ColumnPicker<T extends string>({ columns, visible, onChange }: {
  columns: readonly { id: T; label: string }[];
  visible: readonly T[];
  onChange: (ids: T[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><ChipButton aria-label={`Columns, ${visible.length} of ${columns.length} visible`}>
        <Columns3 className="size-3.5 shrink-0" />
        Columns <span className="text-muted-foreground tabular-nums">{visible.length}/{columns.length}</span>
      </ChipButton></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        {columns.map(({ id, label }) => (
          <DropdownMenuCheckboxItem key={id} checked={visible.includes(id)} onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => onChange(columns.filter((c) => c.id === id ? checked : visible.includes(c.id)).map((c) => c.id))}>
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <MenuAction kind="menu" onSelect={() => onChange(columns.map((c) => c.id))}>Show all columns</MenuAction>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HiddenColumnsEmpty({ onShowAll }: { onShowAll: () => void }) {
  return <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
    <Columns3 className="size-6 text-muted-foreground" />
    <p className="text-sm font-medium">All columns are hidden</p>
    <p className="text-xs text-muted-foreground">Choose columns above to focus your board.</p>
    <ChipButton
      type="button"
      onClick={onShowAll}
      variant="secondary"
      size="compact"
    >Show all columns</ChipButton>
  </div>;
}
