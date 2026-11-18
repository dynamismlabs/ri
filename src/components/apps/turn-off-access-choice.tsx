'use client';

import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { turnOffAccessChoice } from '@/lib/apps/remove-copy';

/**
 * The tick box in Remove's confirmation for an app Ri can't uninstall (its folder is gone): also
 * turn off what it can reach through the hub. On to start with, since the app may keep running.
 */
export function TurnOffAccessChoice({ name, onChange }: { name: string; onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(true);
  const id = useId();
  const { label, help } = turnOffAccessChoice(name);
  return (
    <div className="flex items-start gap-2 rounded-md border border-border p-3">
      <Checkbox id={id} checked={on} aria-describedby={`${id}-help`} className="mt-0.5"
        onCheckedChange={(value) => { const next = value === true; setOn(next); onChange(next); }} />
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm text-foreground">{label}</label>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}
