import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@/constants/app';
import { avatarArtSvg } from './art';
import { COORDINATOR_COLORS, isCoordinatorColor, parseCoordinatorLook, textColorOn } from './look';
import { normalizeCoordinatorName } from './name';
import { COORDINATOR_PRESETS, PRESET_NOTE_MAX } from './presets';

const image = {
  fileName: '01a0f8ec-b320-7fb4-8368-699677275515.png',
  originalName: 'me.png',
  mimeType: 'image/png',
  size: 1234,
  uploadedAt: '2026-10-01T00:00:00.000Z',
};

describe('parseCoordinatorLook', () => {
  it('leaves out what the body leaves out', () => {
    expect(parseCoordinatorLook({ name: 'Trey' })).toEqual({ patch: {} });
  });

  it('keeps one emoji and folds a blank one to none', () => {
    expect(parseCoordinatorLook({ coordinatorEmoji: ' 🍞 ' })).toEqual({ patch: { coordinatorEmoji: '🍞' } });
    expect(parseCoordinatorLook({ coordinatorEmoji: '👩‍🚀' })).toEqual({ patch: { coordinatorEmoji: '👩‍🚀' } });
    expect(parseCoordinatorLook({ coordinatorEmoji: '' })).toEqual({ patch: { coordinatorEmoji: null } });
    expect(parseCoordinatorLook({ coordinatorEmoji: null })).toEqual({ patch: { coordinatorEmoji: null } });
  });

  it('refuses words and strings of emoji', () => {
    expect(parseCoordinatorLook({ coordinatorEmoji: 'Rye' })).toHaveProperty('error');
    expect(parseCoordinatorLook({ coordinatorEmoji: '🍞🍞🍞' })).toHaveProperty('error');
    expect(parseCoordinatorLook({ coordinatorEmoji: 5 })).toHaveProperty('error');
  });

  it('holds colors to the palette', () => {
    expect(parseCoordinatorLook({ coordinatorColor: '#4F7CF0' })).toEqual({ patch: { coordinatorColor: '#4f7cf0' } });
    expect(parseCoordinatorLook({ coordinatorColor: null })).toEqual({ patch: { coordinatorColor: null } });
    expect(parseCoordinatorLook({ coordinatorColor: '#123456' })).toHaveProperty('error');
    expect(parseCoordinatorLook({ coordinatorColor: 'red' })).toHaveProperty('error');
  });

  it('takes an uploaded image and nothing else', () => {
    expect(parseCoordinatorLook({ coordinatorImage: image })).toEqual({ patch: { coordinatorImage: image } });
    expect(parseCoordinatorLook({ coordinatorImage: null })).toEqual({ patch: { coordinatorImage: null } });
    expect(parseCoordinatorLook({ coordinatorImage: { ...image, mimeType: 'application/pdf' } })).toHaveProperty('error');
    expect(parseCoordinatorLook({ coordinatorImage: { ...image, fileName: '../../etc/passwd' } })).toHaveProperty('error');
    expect(parseCoordinatorLook({ coordinatorImage: 'me.png' })).toHaveProperty('error');
  });
});

describe('the palette', () => {
  it('gives every color a readable initial', () => {
    for (const { hex } of COORDINATOR_COLORS) {
      expect(isCoordinatorColor(hex)).toBe(true);
      expect(['#ffffff', '#1c1917']).toContain(textColorOn(hex));
    }
    expect(textColorOn('#f3ead8')).toBe('#1c1917');
    expect(textColorOn('#4f7cf0')).toBe('#ffffff');
  });
});

describe('COORDINATOR_PRESETS', () => {
  it('starts from the default name and its mark', () => {
    expect(COORDINATOR_PRESETS[0]).toMatchObject({ name: APP_NAME, emoji: null, color: null });
  });

  it('holds only names, emoji and colors a write would accept', () => {
    const names = new Set<string>();
    for (const preset of COORDINATOR_PRESETS) {
      expect(normalizeCoordinatorName(preset.name)).toBe(preset.name);
      names.add(preset.name);
      const parsed = parseCoordinatorLook({ coordinatorEmoji: preset.emoji, coordinatorColor: preset.color });
      expect(parsed).toEqual({ patch: { coordinatorEmoji: preset.emoji, coordinatorColor: preset.color } });
      expect(preset.note).not.toMatch(/[—–;]/);
      expect([...preset.note].length).toBeLessThanOrEqual(PRESET_NOTE_MAX);
    }
    expect(names.size).toBe(COORDINATOR_PRESETS.length);
  });
});

describe('avatarArtSvg', () => {
  it('draws the same picture for the same seed and different ones otherwise', () => {
    expect(avatarArtSvg(42)).toBe(avatarArtSvg(42));
    expect(avatarArtSvg(42)).not.toBe(avatarArtSvg(43));
  });

  it('is a plain square SVG with nothing that runs or links', () => {
    for (const seed of [0, 1, 7, 99, 2 ** 31 - 1]) {
      const svg = avatarArtSvg(seed);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/<script|on[a-z]+=|href|<text|<foreignObject/i);
    }
  });
});
