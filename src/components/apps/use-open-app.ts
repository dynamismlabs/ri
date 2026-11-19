'use client';

import { useQuery } from '@tanstack/react-query';
import { connectedAppsQuery } from '@/components/mcp-apps/catalog';

/**
 * Open a connected app the way the person means it: its own screen, when it has one that opens on
 * its own (a global entrypoint), or else its page in Apps, which says how to use it in chat.
 */
export function useOpenApp(navigate: (route: string) => void) {
  const catalog = useQuery(connectedAppsQuery());
  return (serverId: string) => {
    const app = catalog.data?.find((item) => item.id === serverId);
    const entry = app?.available ? app.entrypoints[0] : undefined;
    navigate(entry ? `~connected/${serverId}?open=${encodeURIComponent(entry.name)}` : `~connected/${serverId}`);
  };
}
