'use client';
import { Card } from '@/components/system/card';

import { Moon, Sun, SunMoon } from 'lucide-react';
import { SegmentedControl, type SegmentOption } from '@/components/system/segmented-control';
import { useControlShape, useThemePreference } from '@/lib/client/theme';
import type { ThemePreference } from '@/types/dashboard';

/** The three theme choices, in the order every settings surface shows them. */
export const THEME_OPTIONS = [
  { value: 'system', label: 'Automatic', icon: <SunMoon /> },
  { value: 'light', label: 'Light', icon: <Sun /> },
  { value: 'dark', label: 'Dark', icon: <Moon /> },
] as const satisfies ReadonlyArray<SegmentOption<ThemePreference>>;

/** Shared appearance controls. They never read or write a Home's server settings. */
export function ThemeSettings() {
  const { preference, setPreference } = useThemePreference();
  const { shape, setControlShape } = useControlShape();
  return <section className="space-y-2">
    <h3 className="text-[12px] font-medium text-foreground">Theme</h3>
    <p className="text-[11px] text-muted-foreground/85">
      Automatic follows your device&apos;s light or dark setting and changes when it does.
    </p>
    <Card padding="md" className="flex items-center">
      <SegmentedControl mode="choice" selection="radio" ariaLabel="Theme" value={preference} onChange={setPreference} options={THEME_OPTIONS} />
    </Card>
    <Card padding="md" className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-foreground">Button shape</p>
        <p className="text-[11px] text-muted-foreground/60">Fully round buttons and switches, or rounded rectangles.</p>
      </div>
      <SegmentedControl mode="choice" selection="radio" ariaLabel="Button shape" value={shape} onChange={setControlShape} options={[{ value: 'round', label: 'Round' }, { value: 'rect', label: 'Rounded' }]} />
    </Card>
  </section>;
}
