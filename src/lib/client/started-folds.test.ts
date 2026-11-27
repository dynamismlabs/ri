import { describe, expect, it } from 'vitest';
import { parseOpenGroups, toggledOpenGroups } from './started-folds';

describe('open started groups', () => {
  it('reads what was stored, and nothing from anything else', () => {
    expect([...parseOpenGroups('["session:a","agent:b"]')]).toEqual(['session:a', 'agent:b']);
    expect(parseOpenGroups(null).size).toBe(0);
    expect(parseOpenGroups('not json').size).toBe(0);
    expect(parseOpenGroups('{"a":1}').size).toBe(0);
    expect([...parseOpenGroups('["a",2,null]')]).toEqual(['a']);
  });

  it('opens and folds one group, keeping the most recently opened when it grows', () => {
    expect(toggledOpenGroups(new Set(['a']), 'b')).toEqual(['a', 'b']);
    expect(toggledOpenGroups(new Set(['a', 'b']), 'a')).toEqual(['b']);
    const many = new Set(Array.from({ length: 200 }, (_, i) => `g${i}`));
    const next = toggledOpenGroups(many, 'new');
    expect(next).toHaveLength(200);
    expect(next[0]).toBe('g1');
    expect(next.at(-1)).toBe('new');
  });
});
