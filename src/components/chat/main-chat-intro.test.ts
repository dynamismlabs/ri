import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/trpc/client', () => ({ trpc: {} }));
import { appMainChatIntro } from './main-chat-intro';
import { FIRST_TASK_PROMPT } from '@/lib/coordinator/first-task';

describe('appMainChatIntro', () => {
  it('starts a Ri with no tasks on its first real task, with planning and discovery beside it', () => {
    const intro = appMainChatIntro('Rye', { fresh: true });
    expect(intro.title).toBe('What do you need to get done?');
    expect(intro.description).toContain('I’ll save it as your first task');
    expect(intro.starters.map((s) => s.label)).toEqual(['Capture your first task', 'Plan my day with me', 'What can you do for me?']);
    // The first is the primary one, finished in the composer with the person's own words.
    expect(intro.starters[0]).toMatchObject({ draft: true, primary: true, prompt: FIRST_TASK_PROMPT });
    expect(intro.starters.slice(1).some((s) => s.primary || s.draft)).toBe(false);
  });

  it('keeps the usual starters once there is work to read', () => {
    const labels = appMainChatIntro('Rye').starters.map((s) => s.label);
    expect(labels).toContain('What’s on my plate today?');
    expect(labels).not.toContain('Capture your first task');
    expect(appMainChatIntro('Rye').starters.some((s) => s.primary)).toBe(false);
  });
});
