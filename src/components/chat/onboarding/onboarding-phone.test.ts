import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseHTML } from 'linkedom';
import type { DeviceView } from '@/lib/api/devices';
import { PhoneOffer } from './onboarding-phone';

const fixtures = vi.hoisted(() => ({
  devices: [] as unknown[],
  polls: [] as unknown[],
  tunnel: null as string | null,
  pair: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('@/hooks/use-devices', () => ({
  useDevices: (options: { refetchInterval?: number | false } = {}) => {
    fixtures.polls.push(options.refetchInterval ?? false);
    return { data: fixtures.devices };
  },
}));
vi.mock('@/lib/api/settings', () => ({
  settingsApi: { getBaseUrls: async () => ({ tunnel: fixtures.tunnel, lan: 'http://192.168.1.20:4224', local: 'http://localhost:4224' }) },
}));
vi.mock('@/lib/api/devices', () => ({ devicesApi: { pair: fixtures.pair } }));
vi.mock('@/components/settings/settings-store', async (original) => ({
  ...(await original<typeof import('@/components/settings/settings-store')>()),
  openSettings: fixtures.openSettings,
}));
// Settings' own pairing form, and its link panel as a stand-in: the real panel
// (tabs, QR code) is drawn in a real browser by onboarding-phone.browser.test.ts.
vi.mock('@/components/settings/devices-section', async (original) => {
  const { createElement } = await import('react');
  return {
    ...(await original<typeof import('@/components/settings/devices-section')>()),
    PairingPanel: ({ pairing, baseUrls }: { pairing: { device: { name: string }; plaintext: string }; baseUrls: { tunnel: string } }) =>
      createElement('p', { 'data-pairing-link': `${baseUrls.tunnel}/#token=${pairing.plaintext}` }, `Pairing link for ${pairing.device.name}`),
  };
});

const home = { id: 'home', name: 'Mac mini', kind: 'computer', status: 'active', isHome: true, keys: [] } as unknown as DeviceView;
const phone = (lastUsedAt: string | null) => ({
  id: 'phone-1', name: 'My phone', kind: 'phone', status: 'active', isHome: false,
  keys: [{ id: 'key-1', lastUsedAt, revokedAt: null }],
}) as unknown as DeviceView;

let root: Root;
let client: QueryClient;
let container: HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.devices = [home];
  fixtures.polls = [];
  fixtures.tunnel = null;
  fixtures.pair.mockResolvedValue({ device: { id: 'phone-1', name: 'My phone' }, plaintext: 'ri_pairing_token' });
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(window, { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('navigator', window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

/** Query results reach components on a timer, after the act that caused them. */
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function render() {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(PhoneOffer))));
  await flush();
}
const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
async function click(label: string) {
  const target = button(label);
  expect(target, `button "${label}"`).toBeDefined();
  await act(async () => target!.click());
}

describe('Use Ri on your phone, at the end of setup', () => {
  it('is not offered to a home that already has a paired phone', async () => {
    fixtures.devices = [home, phone('2026-11-26T09:00:00.000Z')];
    fixtures.tunnel = 'https://ri.example.com';
    await render();
    expect(container.textContent).toBe('');
  });

  it('is offered while a pairing link made earlier was never opened', async () => {
    fixtures.devices = [home, phone(null)];
    await render();
    expect(button('Use Ri on your phone')).toBeDefined();
  });

  it('without a secure address, explains why and opens the remote address setup', async () => {
    await render();
    await click('Use Ri on your phone');
    expect(container.textContent).toContain('Set up phone access');
    expect(container.textContent).toContain('secure address, one that starts with https');
    expect(container.textContent).toContain('microphone');
    expect(container.textContent).toContain('away from home');
    expect(container.querySelector('input')).toBeNull();

    await click('Set up phone access');
    expect(fixtures.openSettings).toHaveBeenCalledWith('devices', { anchor: 'phone-access' });
    expect(container.textContent).toContain('choose Back to pairing');

    // Saved in Settings (which writes the same cache): back here, it's the pairing form.
    fixtures.tunnel = 'https://ri.example.com';
    await act(async () => client.setQueryData(['settings', 'base-url'], { tunnel: fixtures.tunnel, lan: null, local: 'http://localhost:4224' }));
    await flush();
    expect(container.textContent).toContain('Your secure address is ready.');
    expect(button('Create pairing link')).toBeDefined();
  });

  it('treats a plain http remote address as missing, since a phone’s microphone needs https', async () => {
    fixtures.tunnel = 'http://mac.tail-scale.ts.net:4224';
    await render();
    await click('Use Ri on your phone');
    expect(container.textContent).toContain('Set up phone access');
    expect(button('Create pairing link')).toBeUndefined();
  });

  it('with a secure address, pairs a phone with Settings’ own form, QR code and link, then says when it’s paired', async () => {
    fixtures.tunnel = 'https://ri.example.com';
    await render();
    await click('Use Ri on your phone');
    const name = container.querySelector('input') as HTMLInputElement;
    expect(name.value).toBe('My phone');
    // A phone, so it doesn't ask for the kind.
    expect(container.querySelector('select')).toBeNull();
    expect(fixtures.polls.every((interval) => interval === false)).toBe(true);

    await click('Create pairing link');
    await flush();
    expect(fixtures.pair).toHaveBeenCalledWith({ name: 'My phone', kind: 'phone' });
    expect(container.querySelector('[data-pairing-link]')?.getAttribute('data-pairing-link')).toBe('https://ri.example.com/#token=ri_pairing_token');
    expect(container.textContent).toContain('Waiting for your phone to open the link');
    // It keeps checking for the phone while the code is up.
    expect(fixtures.polls.at(-1)).toBe(3000);

    fixtures.devices = [home, phone('2026-11-26T09:00:00.000Z')];
    await render();
    expect(container.textContent).toContain('Your phone is paired.');
    expect(container.textContent).toContain('add Ri to the home screen');
  });

  it('closes again with Cancel or Not now, and the line stays', async () => {
    await render();
    await click('Use Ri on your phone');
    await click('Not now');
    expect(button('Use Ri on your phone')).toBeDefined();
    fixtures.tunnel = 'https://ri.example.com';
    await act(async () => client.setQueryData(['settings', 'base-url'], { tunnel: fixtures.tunnel, lan: null, local: '' }));
    await flush();
    await click('Use Ri on your phone');
    await click('Cancel');
    expect(button('Use Ri on your phone')).toBeDefined();
  });
});
