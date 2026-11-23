'use client';

import { Button } from '@/components/system/button';
import { BookOpen, ExternalLink, Github } from 'lucide-react';
import { PreviewSettingsPanel } from '@/components/settings/preview-settings-panel';
import { BEAMD_LINKS } from '@/lib/preview/beamd/links';

/**
 * Remote preview pane. PreviewSettingsPanel carries the provider radios,
 * the Beamd connect block, and the manual-URL template; we add a one-line
 * pitch + repo/docs links (the bits the old Beamd onboarding sheet provided,
 * since its CTAs now open this pane).
 */
export function RemotePreviewSection() {
  return (
    <div className="space-y-5">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Your dev server only runs on this machine. A remote provider gives each preview a real, secure URL. Open it on
        your phone, test on real devices, or share a live link without deploying.
      </p>

      <PreviewSettingsPanel />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <LinkPill href={BEAMD_LINKS.repo} icon={<Github size={13} />}>
          Open source
        </LinkPill>
        <LinkPill href={BEAMD_LINKS.docs} icon={<BookOpen size={13} />}>
          Docs
        </LinkPill>
      </div>
    </div>
  );
}

function LinkPill({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button asChild variant="secondary" size="sm" className="inline-flex items-center gap-1.5"><a href={href}
      target="_blank"
      rel="noopener noreferrer">
      {icon}
      {children}
      <ExternalLink size={11} className="text-muted-foreground" />
    </a></Button>
  );
}
