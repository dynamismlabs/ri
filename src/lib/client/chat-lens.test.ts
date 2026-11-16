import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_CHAT_LENS,
  DEFAULT_PHONE_CHAT_LENS,
  parseAgentChatLens,
  parseOpenAgents,
  parsePhoneChatLens,
} from './chat-lens';

describe('parsePhoneChatLens', () => {
  it('keeps the three tabs', () => {
    expect(parsePhoneChatLens('unread')).toBe('unread');
    expect(parsePhoneChatLens('working')).toBe('working');
    expect(parsePhoneChatLens('agents')).toBe('agents');
  });

  it('opens on Unread, what the tab led with before', () => {
    expect(DEFAULT_PHONE_CHAT_LENS).toBe('unread');
    expect(parsePhoneChatLens(null)).toBe('unread');
    // An agent's tab name isn't one of the phone's.
    expect(parsePhoneChatLens('all')).toBe('unread');
  });
});

describe('parseAgentChatLens', () => {
  it('keeps the three tabs', () => {
    expect(parseAgentChatLens('all')).toBe('all');
    expect(parseAgentChatLens('unread')).toBe('unread');
    expect(parseAgentChatLens('working')).toBe('working');
  });

  it('opens on All', () => {
    expect(DEFAULT_AGENT_CHAT_LENS).toBe('all');
    expect(parseAgentChatLens(null)).toBe('all');
    expect(parseAgentChatLens('agents')).toBe('all');
  });
});

describe('parseOpenAgents', () => {
  it('reads the opened agents', () => {
    expect([...parseOpenAgents('["fin","ri"]')]).toEqual(['fin', 'ri']);
  });

  it('starts every agent folded on anything else', () => {
    expect(parseOpenAgents(null).size).toBe(0);
    expect(parseOpenAgents('not json').size).toBe(0);
    expect(parseOpenAgents('{"fin":true}').size).toBe(0);
    expect([...parseOpenAgents('["fin",3,null]')]).toEqual(['fin']);
  });
});
