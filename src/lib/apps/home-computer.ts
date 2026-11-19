import { getDevice, getHome } from '@/lib/db/queries';

/**
 * The name of the computer this Home runs on, as the person named it ("AI Mac Mini"), or null when
 * it has none. Apps run there, and their own pages only open there.
 */
export function homeComputerName(): string | null {
  const id = getHome()?.hostDeviceId;
  return (id ? getDevice(id)?.name?.trim() : null) || null;
}
