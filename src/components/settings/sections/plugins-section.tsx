'use client';

import { SegmentedRoot, SegmentedList, SegmentedPanel } from '@/components/system/segmented-control';

import { INTEGRATION_LABELS } from '@/constants/integrations';
import { useId, useState } from 'react';
import { PanelsTopLeft, Plus } from 'lucide-react';
import { Button } from '@/components/system/button';
import { openSettings, useSettingsStore } from '@/components/settings/settings-store';
import { IntegrationsSection } from './integrations-section';
import { NewSkillButton, SkillsTab } from './plugins/skills-catalog';
import { InteractiveExamples } from './plugins/interactive-examples';
import { McpServersSection } from './plugins/mcp-servers-section';
import { PLUGIN_CREATE_ANCHORS, pluginsTabFor, type PluginsTab } from './plugins/navigation';
import { useViewportTier } from '@/hooks/use-viewport-tier';

/** Tab labels in one place, so renaming a kind is one line. */
const TABS: ReadonlyArray<{ value: PluginsTab; label: string }> = [
  { value: 'integrations', label: INTEGRATION_LABELS.plural },
  { value: 'skills', label: 'Skills' },
  { value: 'mcp', label: 'MCP servers' },
];

/** Creation stays available while the tabs organize what is already installed. */
export function PluginsSection() {
  const actionSize = useViewportTier() === 'phone' ? 'touch' : 'sm';
  const { anchor } = useSettingsStore();
  const tab = pluginsTabFor(anchor);
  const [visited, setVisited] = useState<PluginsTab[]>([tab]);
  // Mount each catalog on first use, then retain its search and unfinished form.
  if (!visited.includes(tab)) setVisited([...visited, tab]);
  const [showExamples, setShowExamples] = useState(false);
  const examplesId = useId();

  return (
    <SegmentedRoot
      mode="tabs"
      value={tab}
      onChange={(value) => openSettings('plugins', { anchor: value })}
      className="flex flex-col gap-5"
    >
      {/* The sticky surface owns its top spacing and spans the pane's padding,
          so scrolled content cannot show above or beside it. */}
      <div
        className="sticky top-0 z-20 -mx-5 space-y-3 border-b border-border/60 bg-popover px-5 pb-1 pt-6"
        data-plugin-actions
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => openSettings('plugins', { anchor: PLUGIN_CREATE_ANCHORS.connectService })}
            variant="secondary"
            size={actionSize}
          >
            <Plus size={12} /> Connect a service
          </Button>
          <NewSkillButton size={actionSize} />
          <Button
            onClick={() => openSettings('plugins', { anchor: PLUGIN_CREATE_ANCHORS.mcpServer })}
            variant="secondary"
            size={actionSize}
          >
            <Plus size={12} /> Add MCP server
          </Button>
        </div>
        <SegmentedList
          options={TABS}
          ariaLabel="Plugins"
          size={actionSize === 'touch' ? 'touch' : 'compact'}
        />
      </div>
      {visited.includes('integrations') && (
        <SegmentedPanel keepMounted hidden={tab !== 'integrations'} value="integrations">
          <IntegrationsSection active={tab === 'integrations'} />
        </SegmentedPanel>
      )}
      {visited.includes('skills') && (
        <SegmentedPanel keepMounted hidden={tab !== 'skills'} value="skills">
          <SkillsTab />
        </SegmentedPanel>
      )}
      {visited.includes('mcp') && (
        <SegmentedPanel keepMounted hidden={tab !== 'mcp'} value="mcp">
          <McpServersSection active={tab === 'mcp'} />
        </SegmentedPanel>
      )}
      <div className="border-t border-border/60 pt-3">
        <Button
          aria-expanded={showExamples}
          aria-controls={examplesId}
          onClick={() => setShowExamples((value) => !value)}
          variant="ghost"
          size="xs"
        >
          <PanelsTopLeft size={12} /> Interactive examples
        </Button>
        {showExamples && (
          <div id={examplesId} className="mt-3">
            <InteractiveExamples />
          </div>
        )}
      </div>
    </SegmentedRoot>
  );
}
