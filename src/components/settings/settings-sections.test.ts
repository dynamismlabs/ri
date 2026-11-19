import { describe, expect, it } from 'vitest';
import { sectionFromParam } from './settings-sections';

describe('sectionFromParam', () => {
  it('opens a section by its id', () => {
    expect(sectionFromParam('plugins')).toBe('plugins');
    expect(sectionFromParam('models')).toBe('models');
  });

  it('follows ids that saved links and OAuth returns still carry', () => {
    expect(sectionFromParam('connectors')).toBe('plugins');
    // Get started is gone, and a link to it opens Profile.
    expect(sectionFromParam('get-started')).toBe('profile');
  });

  it('opens nothing for an unknown or missing value', () => {
    expect(sectionFromParam('integrations')).toBeNull();
    expect(sectionFromParam('nope')).toBeNull();
    expect(sectionFromParam('')).toBeNull();
    expect(sectionFromParam(null)).toBeNull();
    expect(sectionFromParam(undefined)).toBeNull();
  });
});
