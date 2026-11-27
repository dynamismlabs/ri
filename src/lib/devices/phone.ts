/**
 * What a phone needs to use this Ri, for the first run's phone offer and the
 * remote address setup it links to. Client-safe: plain data in, no server.
 */
import type { DeviceView } from '@/lib/api/devices';

/**
 * A phone that has paired: one of this Ri's phones whose key has been used.
 * A pairing link made but never opened doesn't count, and neither does a
 * removed device or a revoked key.
 */
export function hasPairedPhone(devices: readonly DeviceView[]): boolean {
  return devices.some((device) => isPairedPhone(device));
}

export function isPairedPhone(device: DeviceView): boolean {
  return !device.isHome
    && device.kind === 'phone'
    && device.status === 'active'
    && device.keys.some((key) => !key.revokedAt && !!key.lastUsedAt);
}

/**
 * The remote address when a phone can use it fully: HTTPS, which the
 * microphone (and notifications) need, and reachable away from home. Null
 * when there is none, or it's plain http.
 */
export function securePhoneAddress(remote: string | null | undefined): string | null {
  return remote && /^https:\/\//i.test(remote.trim()) ? remote.trim() : null;
}
