'use client';
import { Card } from '@/components/system/card';
import { ChoiceRow } from '@/components/system/choice-row';

import { Field as SystemField } from '@/components/system/field';

import { Button } from '@/components/system/button';
import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePreviewSettings, useUpdatePreviewSettings } from '@/hooks/use-preview';
import { BeamdConnect } from './beamd-connect';
import { SettingsSkeleton } from '@/components/settings/settings-skeleton';

/**
 * Global preview-reachability settings: choose the active remote provider
 * and configure it. Localhost-only needs nothing; Beamd needs a server +
 * token; Manual takes a default URL template. Lives in the Devices sheet
 * alongside the other local/remote handoff controls.
 */
export function PreviewSettingsPanel() {
  const { data: settings, isLoading } = usePreviewSettings();
  const update = useUpdatePreviewSettings();

  const [manualTemplate, setManualTemplate] = useState('');

  // Fill the local fields from the server settings each time they arrive. Set
  // while rendering, so the field never paints the previous value.
  const [hydratedFrom, setHydratedFrom] = useState<typeof settings>(undefined);
  if (settings && settings !== hydratedFrom) {
    setHydratedFrom(settings);
    setManualTemplate(settings.manualTemplate ?? '');
  }

  if (isLoading || !settings) {
    return <PanelShell><SettingsSkeleton rows={3} /></PanelShell>;
  }

  const active = settings.activeProvider;

  const selectProvider = (id: string) => {
    update.mutate({ activeProvider: id });
  };

  // Connecting beamd implies you want to use it — make it the active provider
  // (from localhost, manual, or anything else) so remote previews resolve.
  const handleBeamdConnected = () => {
    if (settings.activeProvider !== 'beamd') update.mutate({ activeProvider: 'beamd' });
  };

  return (
    <PanelShell>
      <div className="space-y-3">
        <p className="text-muted-foreground">
          How previews are reached when you&apos;re not on the machine running the app.
        </p>

        {/* Provider radio list */}
        <div className="space-y-1.5">
          {settings.providers.map((p) => (
            <ProviderRow
              key={p.id}
              id={p.id}
              label={providerLabel(p.id, p.label)}
              description={providerDescription(p.id)}
              selected={active === p.id}
              onSelect={() => selectProvider(p.id)}
            />
          ))}
        </div>

        {/* Beamd account — machine-level (the shared `~/.beamd` login), shown
            always so you can connect or fix it here no matter which provider is
            active. */}
        <div className="space-y-1.5 border-t border-border pt-3">
          <h4 className="text-[11px] font-semibold text-muted-foreground/70">
            Beamd · this machine
          </h4>
          <BeamdConnect onConnected={handleBeamdConnected} />
        </div>

        {/* Manual template */}
        {active === 'manual' && (
          <Card padding="md" className="space-y-2.5">
            <SystemField
              value={manualTemplate}
              onChange={(e) => setManualTemplate(e.target.value)}
              placeholder="https://{name}.mytunnel.com"
              spellCheck={false}
              className="w-full"
              purpose="code"
              label="Default URL template"
            />
            <p className="text-[11px] text-muted-foreground">
              Used when no explicit URL is pasted on an execution. <code className="rounded bg-muted px-1">{'{name}'}</code> is the preview name.
            </p>
            <Button
              type="button"
              onClick={() => update.mutate({ manualTemplate: manualTemplate.trim() || null })}
              disabled={update.isPending}
              variant="primary"
              size="md"
              className="flex items-center gap-1.5"
            >
              {update.isPending && <Loader2 size={12} className="animate-spin" />}
              Save
            </Button>
          </Card>
        )}

      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-4 text-[12px]">
      <header className="flex items-center gap-2 text-foreground">
        <Globe size={14} className="text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Remote preview</h3>
      </header>
      {children}
    </section>
  );
}

function ProviderRow({
  id, label, description, selected, onSelect,
}: {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ChoiceRow
      type="button"
      onClick={onSelect}

      aria-pressed={selected}
      className="flex w-full items-start gap-2.5 text-left"
    >
      <span
        className={cn(
          'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      </span>
      <span className="flex flex-col">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </span>
    </ChoiceRow>
  );
}

function providerLabel(id: string, fallback: string): string {
  if (id === 'localhost') return 'Localhost only';
  return fallback;
}

function providerDescription(id: string): string {
  switch (id) {
    case 'localhost':
      return 'Previews only load on this machine. No remote access.';
    case 'beamd':
      return 'Connect your Beamd account, or self-host for free. Reachable anywhere.';
    case 'manual':
      return 'Run your own tunnel and paste the URL in each chat.';
    default:
      return 'Community provider.';
  }
}
