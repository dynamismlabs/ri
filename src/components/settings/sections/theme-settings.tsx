'use client';

import { Moon, Paintbrush, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useClientLook } from '@/lib/client/look';
import { useClientTheme } from '@/lib/client/theme';

/** Shared appearance controls. They never read or write a Home's server settings. */
export function ThemeSettings() {
  const { theme, toggleTheme } = useClientTheme();
  const { look, toggleLook } = useClientLook();
  const isDark = theme === 'dark';
  return <section className="space-y-2">
    <h3 className="text-[12px] font-medium text-foreground">Theme</h3>
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
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
    </label>
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Paintbrush size={16} className="text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">New look (preview)</p>
          <p className="text-[11px] text-muted-foreground/60">Try Ri&apos;s new design in this browser. Switch back any time.</p>
        </div>
      </div>
      <Switch checked={look === 'edge'} onCheckedChange={toggleLook} aria-label="New look" />
    </label>
  </section>;
}
