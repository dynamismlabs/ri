'use client';

import { useEffect } from 'react';
import { Dialog } from '@/components/system/dialog';
import { SettingsPanel } from './settings-panel';
import { SettingsNav } from './settings-nav';
import {
  useSettingsStore,
  openSettings,
  closeSettings,
  setSettingsSection,
} from './settings-store';
import { getSection, type SectionId, sectionFromParam } from './settings-sections';

import { ProfileSection } from './sections/profile-section';
import { GeneralSection } from './sections/general-section';
import { HeartbeatSection } from './sections/heartbeat-section';
import { ModelsSection } from './sections/models-section';
import { VoiceSection } from './sections/voice-section';
import { BrowserSection } from './sections/browser-section';
import { PluginsSection } from './sections/plugins-section';
import { NotificationsSection } from './sections/notifications-section';
import { DevicesSettingsSection } from './sections/devices-section';
import { ExternalAiSection } from './sections/external-ai-section';
import { ConversationsSection } from './sections/conversations-section';
import { TeamsSection } from './sections/teams-section';
import { RemotePreviewSection } from './sections/remote-preview-section';
import { UpdatesSection } from './sections/updates-section';
import { ThisComputerSection } from './sections/this-computer-section';
import { ImportsSection } from './sections/imports-section';

function SectionBody({ id }: { id: SectionId }) {
  // Only the active pane mounts — the Notifications pane in particular fires a
  // batch of fetches on mount, so we never pay for panes the user isn't viewing.
  switch (id) {
    case 'profile':
      return <ProfileSection />;
    case 'general':
      return <GeneralSection />;
    case 'heartbeat':
      return <HeartbeatSection />;
    case 'models':
      return <ModelsSection />;
    case 'voice':
      return <VoiceSection />;
    case 'browser':
      return <BrowserSection />;
    case 'plugins':
      return <PluginsSection />;
    case 'notifications':
      return <NotificationsSection />;
    case 'imports':
      return <ImportsSection />;
    case 'updates':
      return <UpdatesSection />;
    case 'this-computer':
      return <ThisComputerSection />;
    case 'devices':
      return <DevicesSettingsSection />;
    case 'external-ai':
      return <ExternalAiSection />;
    case 'conversations':
      return <ConversationsSection />;
    case 'teams':
      return <TeamsSection />;
    case 'remote-preview':
      return <RemotePreviewSection />;
    default:
      return null;
  }
}

/**
 * The one settings surface. Mounted once in the dashboard shell; opened from
 * anywhere via `openSettings(section?)`. Centered dialog with a left side-nav
 * and a single scrollable content pane (the Claude/OpenAI pattern).
 */
export function SettingsModal() {
  const { open, section, anchor } = useSettingsStore();
  const def = getSection(section);
  useEffect(() => window.riDesktop?.onOpenSettings?.(() => openSettings('this-computer')), []);

  // Open from a `?settings=<id>` deep link on first mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = sectionFromParam(params.get('settings'));
    if (section) openSettings(section, { anchor: section === 'plugins' ? params.get('plugin') ?? undefined : undefined });
  }, []);

  // Reflect open state + active section in the URL so the modal is linkable
  // and survives a refresh, without a router round-trip. An app's query never
  // holds `settings` or `plugin` (`active-view.ts`), so a link or reload that
  // opens Settings over an app doesn't hand them to the app.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (open) params.set('settings', section);
    else params.delete('settings');
    if (open && section === 'plugins' && anchor) params.set('plugin', anchor);
    else params.delete('plugin');
    const qs = params.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState(window.history.state, '', url);
  }, [open, section, anchor]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? openSettings() : closeSettings())}>
      <SettingsPanel
        title={def.title}
        description={def.description}
        bodyClassName={section === 'plugins' ? 'pt-0' : undefined}
        navigation={<SettingsNav active={section} onSelect={setSettingsSection} />}
      >
        <SectionBody id={section} />
      </SettingsPanel>
    </Dialog>
  );
}
