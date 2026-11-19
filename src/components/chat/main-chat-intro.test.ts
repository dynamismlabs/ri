import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/trpc/client', () => ({ trpc: {} }));
import { appMainChatIntro } from './main-chat-intro';

describe('appMainChatIntro', () => {
  it('starts a Ri with no tasks on getting the person’s work in', () => {
    const intro = appMainChatIntro('Rye', { fresh: true });
    expect(intro.description).toContain('Tell me what’s on your mind');
    expect(intro.starters.map((s) => s.label)).toEqual(['Here’s what’s on my mind', 'Plan my day with me', 'What can you do for me?']);
    // The first finishes in the composer with the person's own words.
    expect(intro.starters[0]).toMatchObject({ draft: true });
  });

  it('keeps the usual starters once there is work to read', () => {
    const labels = appMainChatIntro('Rye').starters.map((s) => s.label);
    expect(labels).toContain('What’s on my plate today?');
    expect(labels).not.toContain('Here’s what’s on my mind');
  });
});
