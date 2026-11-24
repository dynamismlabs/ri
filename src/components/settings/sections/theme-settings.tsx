'use client';
import { Card } from '@/components/system/card';

import { Moon, Sun, SunMoon } from 'lucide-react';
import { SegmentedControl, type SegmentOption } from '@/components/system/segmented-control';
import { useThemePreference } from '@/lib/client/theme';
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
  return <section className="space-y-2">
    <h3 className="text-[12px] font-medium text-foreground">Theme</h3>
    <p className="text-[11px] text-muted-foreground/85">
      Automatic follows your device&apos;s light or dark setting and changes when it does.
    </p>
    <Card padding="md" className="flex items-center">
      <SegmentedControl mode="choice" selection="radio" ariaLabel="Theme" value={preference} onChange={setPreference} options={THEME_OPTIONS} />
    </Card>
  </section>;
}
