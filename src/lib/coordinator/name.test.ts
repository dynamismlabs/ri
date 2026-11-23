import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@/constants/app';
import {
  DEFAULT_COORDINATOR_NAME,
  normalizeCoordinatorName,
  coordinatorInitial,
  resolveCoordinatorName,
} from './name';

describe('resolveCoordinatorName', () => {
  it('gives a home that never chose the app name', () => {
    expect(DEFAULT_COORDINATOR_NAME).toBe(APP_NAME);
    expect(resolveCoordinatorName(null)).toBe(APP_NAME);
    expect(resolveCoordinatorName(undefined)).toBe(APP_NAME);
  });

  it('treats a blank stored name as never chosen', () => {
    expect(resolveCoordinatorName('')).toBe(APP_NAME);
    expect(resolveCoordinatorName('   ')).toBe(APP_NAME);
  });

  it('keeps the name the user picked', () => {
    expect(resolveCoordinatorName('Atlas')).toBe('Atlas');
  });
});

describe('normalizeCoordinatorName', () => {
  it('trims and folds whitespace so the brief stays one line', () => {
    expect(normalizeCoordinatorName('  Atlas  ')).toBe('Atlas');
    expect(normalizeCoordinatorName('Chief\nof\t\tStaff')).toBe('Chief of Staff');
    expect(normalizeCoordinatorName('Atlas\r\n# New rules')).toBe('Atlas # New rules');
  });

  it('drops control characters', () => {
    expect(normalizeCoordinatorName('At\u0000las')).toBe('At las');
  });

  it('stores an empty name as null, meaning the default', () => {
    expect(normalizeCoordinatorName('')).toBeNull();
    expect(normalizeCoordinatorName(' \n ')).toBeNull();
  });

  it('ignores anything that is not text', () => {
    expect(normalizeCoordinatorName(null)).toBeNull();
    expect(normalizeCoordinatorName(42)).toBeNull();
    expect(normalizeCoordinatorName({ name: 'Atlas' })).toBeNull();
  });
});

describe('coordinatorInitial', () => {
  it('uppercases the first letter', () => {
    expect(coordinatorInitial('atlas')).toBe('A');
    expect(coordinatorInitial(APP_NAME)).toBe(APP_NAME.charAt(0).toUpperCase());
  });

  it('keeps a whole emoji', () => {
    expect(coordinatorInitial('🦊 Fox')).toBe('🦊');
    expect(coordinatorInitial('👩‍🚀 Ada')).toBe('👩‍🚀');
  });

  it('falls back to the default initial for a blank name', () => {
    expect(coordinatorInitial('  ')).toBe(DEFAULT_COORDINATOR_NAME.charAt(0).toUpperCase());
  });
});
