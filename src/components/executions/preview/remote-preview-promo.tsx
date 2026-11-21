'use client';
import { Card } from '@/components/system/card';

import { Button } from '@/components/system/button';
import { Smartphone, Globe } from 'lucide-react';
import { useSettingsLink } from '@/components/settings/settings-destination';

/**
 * Discovery affordance for remote preview, shown in the preview tab's empty
 * states. Two sizes:
 *   - `prominent` (no preview set up yet) → a full card that teaches the
 *     feature and links into setup.
 *   - otherwise → a single subtle line.
 *
 * Visibility/setup gating lives in the caller (PreviewBody), which hides this
 * once remote preview is actually configured — by then the header's "Phone"
 * button is the subtle, always-present entry point.
 */
export function RemotePreviewPromo({ prominent }: { prominent: boolean }) {
  const settings = useSettingsLink('remote-preview');
  if (!settings) return null;
  if (!prominent) {
    return (
      <Button
        type="button"
        onClick={settings}
        variant="secondary"
        size="sm"
        className="inline-flex items-center gap-1.5"
      >
        <Smartphone size={12} className="text-primary" />
        Preview on any device with Beamd →
      </Button>
    );
  }

  return (
    <Card padding="md" className="w-full space-y-2">
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <Smartphone size={13} className="text-primary" />
        Preview on any device
      </h4>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Open your preview on your phone or tablet, or share a live link, no deploy. Running on a server or
        Mac&nbsp;Mini? Review your apps from your laptop, without shuffling code between machines.
      </p>
      <Button
        type="button"
        onClick={settings}
        variant="primary"
        size="md"
        className="flex items-center gap-1.5"
      >
        <Globe size={13} />
        Set up Beamd
      </Button>
    </Card>
  );
}
