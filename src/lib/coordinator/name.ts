/**
 * What the user calls the app's main chat, the coordinator. Stored on
 * `user_state.coordinatorName`, null until the user picks one. Null resolves
 * to the app's own name at read time, so a home that never chose follows the
 * product default (and a rebrand of `APP_NAME`) instead of a value frozen on
 * the day it was created.
 *
 * The rail's home row, the main chat's header, the sender chip and the
 * coordinator's own brief all read through `resolveCoordinatorName`, so the
 * name the user sees is the name the coordinator answers to.
 *
 * Pure and dependency-free apart from the app constants: imported by client
 * components and by the server's brief.
 */

import { APP_NAME } from '@/constants/app';

/** The name a home that never chose one sees. */
export const DEFAULT_COORDINATOR_NAME = APP_NAME;

/** Longest name the PATCH route accepts. Long enough for a real name, short enough for the rail. */
export const COORDINATOR_NAME_MAX = 40;

/**
 * The stored form of a typed name: control characters dropped, every run of
 * whitespace (newlines included) folded to one space, trimmed. An empty result
 * is null, which means "use the default". Folding newlines matters beyond
 * looks: the name is written into the coordinator's brief, where a line break
 * would start a new instruction.
 */
export function normalizeCoordinatorName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || null;
}

/** The name to show and to brief the coordinator with. */
export function resolveCoordinatorName(stored: string | null | undefined): string {
  return normalizeCoordinatorName(stored) ?? DEFAULT_COORDINATOR_NAME;
}

/**
 * The one character the rail draws for the coordinator when there's no room
 * for the name: the first grapheme, uppercased. Grapheme-aware so an emoji
 * name ("🦊 Fox") shows the whole emoji rather than half a surrogate pair.
 */
export function coordinatorInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_COORDINATOR_NAME.charAt(0).toUpperCase();
  let first: string | undefined;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed);
    first = segments[Symbol.iterator]().next().value?.segment;
  }
  first ??= Array.from(trimmed)[0] ?? trimmed.charAt(0);
  return first.toUpperCase();
}
