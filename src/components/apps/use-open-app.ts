'use client';

import { useQuery } from '@tanstack/react-query';
import { connectedAppsQuery } from '@/components/mcp-apps/catalog';

type Openable = { id: string; available: boolean; entrypoints: readonly { name: string }[] };

/**
 * Where opening a connected app goes: its own screen, when it has one that opens on its own (a
 * global entrypoint) and the connection can open, or else its page in Apps, which says how to use it
 * in chat and holds its settings. Every Open in Apps goes through here, so a click opens the app.
 */
export function openAppRoute(serverId: string, apps: readonly Openable[] | undefined) {
  const app = apps?.find((item) => item.id === serverId);
  const entry = app?.available ? app.entrypoints[0] : undefined;
  return entry ? `~connected/${serverId}?open=${encodeURIComponent(entry.name)}` : `~connected/${serverId}`;
}

/** Open a connected app the way the person means it (`openAppRoute`). */
export function useOpenApp(navigate: (route: string) => void) {
  const catalog = useQuery(connectedAppsQuery());
  return (serverId: string) => navigate(openAppRoute(serverId, catalog.data));
}
