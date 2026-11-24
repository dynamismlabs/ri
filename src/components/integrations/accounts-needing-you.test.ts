import { describe, expect, it } from 'vitest';
import type { AccountNeedingYou } from '@/lib/integrations/attention';
import { connectAccountsQuery, reconnectLabel } from './accounts-needing-you';

const account = (name: string, target: AccountNeedingYou['target'], extra: Partial<AccountNeedingYou> = {}): AccountNeedingYou => ({
  key: `${target.kind}:${target.id}:${extra.account ?? ''}`, name, target, ...extra,
});
const google = (label: string) => account('Google', { kind: 'provider', id: 'google' }, { account: label });
const gmail = account('Gmail', { kind: 'application', id: 'gmail' });
const receipts = account('Receipts', { kind: 'server', id: 'receipts' });
const docs = account('Docs', { kind: 'server', id: 'docs' });

describe('connectAccountsQuery', () => {
  it('opens Apps on Connectors while nothing needs you', () => {
    expect(connectAccountsQuery([])).toEqual({ filter: 'Connectors' });
  });

  it('goes straight to the one page in Apps that fixes every account', () => {
    expect(connectAccountsQuery([google('Work'), google('Home')])).toEqual({ provider: 'google' });
    expect(connectAccountsQuery([gmail])).toEqual({ application: 'gmail' });
    expect(connectAccountsQuery([receipts])).toEqual({ mcp: 'receipts' });
  });

  it('opens your library, which marks each, when they live on different pages', () => {
    expect(connectAccountsQuery([google('Work'), gmail])).toEqual({ browse: 'yours' });
    expect(connectAccountsQuery([gmail, receipts])).toEqual({ browse: 'yours' });
    expect(connectAccountsQuery([receipts, docs])).toEqual({ browse: 'yours' });
  });
});

describe('reconnectLabel', () => {
  it('says nothing while nothing needs you', () => {
    expect(reconnectLabel([])).toBeUndefined();
  });

  it('names every account, with the identity that tells them apart', () => {
    expect(reconnectLabel([gmail])).toBe('Reconnect Gmail');
    expect(reconnectLabel([google('Work'), receipts])).toBe('Reconnect Google (Work) and Receipts');
    expect(reconnectLabel([gmail, google('Work'), receipts])).toBe('Reconnect Gmail, Google (Work) and Receipts');
  });
});
