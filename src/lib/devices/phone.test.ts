import { describe, expect, it } from 'vitest';
import type { DeviceView } from '@/lib/api/devices';
import { hasPairedPhone, securePhoneAddress } from './phone';

const key = (over: Partial<DeviceView['keys'][number]> = {}) => ({
  id: 'key', name: 'Key', prefix: 'ri_', suffix: 'abcd', env: 'live', createdAt: '2026-11-26T00:00:00.000Z',
  lastUsedAt: '2026-11-26T01:00:00.000Z', expiresAt: null, revokedAt: null, role: 'sign_in', current: false, ...over,
}) as DeviceView['keys'][number];
const device = (over: Partial<DeviceView> = {}) => ({
  id: 'phone', name: 'My phone', kind: 'phone', status: 'active', isHome: false, keys: [key()], ...over,
}) as DeviceView;

describe('hasPairedPhone', () => {
  it('counts a phone that has signed in with its key', () => {
    expect(hasPairedPhone([device({ id: 'home', kind: 'computer', isHome: true }), device()])).toBe(true);
  });

  it('does not count a pairing link never opened, a revoked key, a removed phone or other devices', () => {
    expect(hasPairedPhone([])).toBe(false);
    expect(hasPairedPhone([device({ keys: [key({ lastUsedAt: null })] })])).toBe(false);
    expect(hasPairedPhone([device({ keys: [key({ revokedAt: '2026-11-26T02:00:00.000Z' })] })])).toBe(false);
    expect(hasPairedPhone([device({ status: 'revoked' as DeviceView['status'] })])).toBe(false);
    expect(hasPairedPhone([device({ kind: 'computer' }), device({ kind: 'tablet' })])).toBe(false);
    expect(hasPairedPhone([device({ isHome: true })])).toBe(false);
  });
});

describe('securePhoneAddress', () => {
  it('is the remote address only when it is https', () => {
    expect(securePhoneAddress('https://ri.example.com')).toBe('https://ri.example.com');
    expect(securePhoneAddress('HTTPS://ri.example.com ')).toBe('HTTPS://ri.example.com');
    expect(securePhoneAddress('http://mac.tail-scale.ts.net:4224')).toBeNull();
    expect(securePhoneAddress(null)).toBeNull();
    expect(securePhoneAddress('')).toBeNull();
  });
});
