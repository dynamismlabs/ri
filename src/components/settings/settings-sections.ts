import { INTEGRATION_LABELS } from '@/constants/integrations';
import {
  User,
  SlidersHorizontal,
  Cpu,
  Mic,
  Plug,
  Cable,
  MessagesSquare,
  Bell,
  MonitorSmartphone,
  Laptop,
  Globe,
  Chrome,
  Download,
  FileInput,
  HeartPulse,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { APP_NAME } from '@/constants/app';

/**
 * Single source of truth for the unified settings modal.
 *
 * The nav, the modal header (title + description), and the deep-link
 * `?settings=<id>` param all derive from this one array — so a section's
 * label/description can only be defined in one place. This is what keeps the
 * old "every sheet titled something slightly different" drift from coming back.
 */
export type SectionId =
  | 'profile'
  | 'general'
  | 'heartbeat'
  | 'models'
  | 'voice'
  | 'browser'
  | 'plugins'
  | 'notifications'
  | 'external-ai'
  | 'conversations'
  | 'devices'
  | 'teams'
  | 'imports'
  | 'remote-preview'
  | 'updates'
  | 'this-computer';

export interface SettingsSectionDef {
  /** Stable id — used for nav state, the content router, and the URL param. */
  id: SectionId;
  /** Short nav label. */
  label: string;
  icon: LucideIcon;
  /** Header shown above the pane. */
  title: string;
  /** One-line header subtitle. */
  description: string;
  /** Optional pill rendered next to the nav label (e.g. "Soon"). */
  badge?: string;
}

export const SECTIONS: readonly SettingsSectionDef[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    title: 'Profile',
    description: 'The context the agent uses to personalize how it works with you.',
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: MonitorSmartphone,
    title: 'Devices',
    description: 'Remote access URL, paired devices, and host-machine settings.',
  },
  {
    // Teams this Ri works with (docs/homes-spec.md §3.1, §9.3).
    id: 'teams',
    label: 'Teams',
    icon: Users,
    title: 'Teams',
    description: 'Shared work with other people. Your personal work stays private.',
  },
  { id: 'conversations', label: 'Slack & Buzz', icon: MessagesSquare, title: 'Slack and Buzz conversations', description: 'Add your Ri agents to Slack or Buzz for two-way conversations.' },
  {
    id: 'general',
    label: 'General',
    icon: SlidersHorizontal,
    title: 'General',
    description: 'Theme, timezone, working hours, and display preferences.',
  },
  {
    id: 'heartbeat',
    label: 'Heartbeat',
    icon: HeartPulse,
    title: 'Heartbeat',
    description: 'A regular check-in on your work, following your instructions.',
  },
  {
    // Plugins: everything agents can be extended with, skills and
    // integrations (docs/skills.md). Links from before the rename still say
    // `?settings=connectors`, which `sectionFromParam` maps here.
    id: 'plugins',
    label: 'Plugins',
    icon: Plug,
    title: 'Plugins',
    description: `${INTEGRATION_LABELS.plural} connect your accounts. Skills teach your agents. MCP servers add custom tools.`,
  },
  {
    id: 'models',
    label: 'Models',
    icon: Cpu,
    title: 'AI & Models',
    description: 'Default provider and model, and usage.',
  },
  {
    id: 'voice',
    label: 'Voice',
    icon: Mic,
    title: 'Voice',
    description: 'Speech-to-text model and whether voice transcriptions send automatically.',
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: Chrome,
    title: 'Agent browser',
    description: 'Let the agent read and act on web pages using sites you sign into once.',
  },
  {
    id: 'imports',
    label: 'Imports',
    icon: FileInput,
    title: 'Import agent history',
    description: 'Bring local projects and chats from Claude Code and Codex into Ri.',
  },
  {
    // Outside agents (Claude Code, Codex, ChatGPT...) using Ri's MCP server
    // (docs/external-ai.md). Named for the direction, Ri going into other
    // agents, so it reads as neither adding one of Ri's own agents nor an MCP
    // server for Ri (those are Plugins). The id predates the name and stays,
    // since links carry it.
    id: 'external-ai',
    label: `${APP_NAME} in other agents`,
    icon: Cable,
    title: `Use ${APP_NAME} in other agents through MCP`,
    description: `Add ${APP_NAME}’s MCP server to Claude Code, Codex, ChatGPT and other agents so they can read and update your tasks, notes and deck.`,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    title: 'Notifications',
    description: 'Delivery channels, event routing, and scheduled digests.',
  },
  {
    id: 'remote-preview',
    label: 'Remote Preview',
    icon: Globe,
    title: 'Remote Preview',
    description: 'How execution previews open on your phone and other devices.',
  },
  { id: 'updates', label: 'Updates', icon: Download, title: 'Updates', description: 'How Ri keeps itself up to date.' },
  { id: 'this-computer', label: 'This computer', icon: Laptop, title: 'This computer', description: 'Local agents, desktop preferences, startup, and updates for this computer.' },
];

export const DEFAULT_SECTION: SectionId = 'profile';

export function getSection(id: SectionId): SettingsSectionDef {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

export function isSectionId(value: string | null | undefined): value is SectionId {
  return !!value && SECTIONS.some((s) => s.id === value);
}

/**
 * Old section ids that links (an OAuth return, a bookmark) may still carry.
 * Keys are values from saved links, so they keep their old spelling through
 * any rename (docs/integrations-naming.md).
 */
const SECTION_ALIASES: Readonly<Record<string, SectionId>> = {
  connectors: 'plugins',
  // Settings had a Get started checklist until 2026-11-18. First run is the
  // main chat's conversation, and Rye offers the extras when they'd help.
  'get-started': 'profile',
};

/** The section a `?settings=` value names, following renamed ids. */
export function sectionFromParam(value: string | null | undefined): SectionId | null {
  if (isSectionId(value)) return value;
  return (value && SECTION_ALIASES[value]) || null;
}
