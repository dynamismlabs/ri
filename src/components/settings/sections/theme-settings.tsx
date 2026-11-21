'use client';
import { Card } from '@/components/system/card';

import { Moon, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useClientTheme } from '@/lib/client/theme';

/** Shared appearance controls. They never read or write a Home's server settings. */
export function ThemeSettings() {
  const { theme, toggleTheme } = useClientTheme();
  const isDark = theme === 'dark';
  return <section className="space-y-2">
    <h3 className="text-[12px] font-medium text-foreground">Theme</h3>
    <Card as="label" padding="md" className="flex cursor-pointer items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          {isDark ? <Moon size={16} className="text-primary" /> : <Sun size={16} className="text-primary" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Dark mode</p>
          <p className="text-[11px] text-muted-foreground/60">Switch between light and dark themes for the whole app.</p>
        </div>
      </div>
      <Switch checked={isDark} onCheckedChange={toggleTheme} aria-label="Dark mode" />
    </Card>
  </section>;
}
