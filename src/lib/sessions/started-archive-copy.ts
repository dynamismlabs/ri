/**
 * What a toast says after started chats were archived with their starter, or
 * from Archive finished (docs/started-chats.md). Pure, so the wording is
 * tested in one place.
 */

export interface StartedOutcomeLike {
  archived: readonly { id: string; label: string }[];
  kept: readonly { id: string; label: string; reason: 'working' | 'needs_you' | 'uncommitted' }[];
}

type Context =
  /** One chat archived, and its started chats with it. */
  | { kind: 'parent'; label: string | null }
  /** Several archived at once, from the rail. */
  | { kind: 'bulk' }
  /** Archive finished on a Started chats list. */
  | { kind: 'finished' };

const MAX_NAMED = 3;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function why(reason: StartedOutcomeLike['kept'][number]['reason']): string {
  if (reason === 'needs_you') return 'needs you';
  if (reason === 'uncommitted') return 'has files that aren’t committed';
  return 'is still working';
}

/** Why the ones left open stay: each by name, the first few. */
function keptLine(kept: StartedOutcomeLike['kept']): string | null {
  if (!kept.length) return null;
  if (kept.length === 1) return `${kept[0]!.label} ${why(kept[0]!.reason)}, so it stays open.`;
  const named = kept.slice(0, MAX_NAMED).map((k) => `${k.label} ${why(k.reason)}`).join('. ');
  const more = kept.length > MAX_NAMED ? ` And ${kept.length - MAX_NAMED} more.` : '';
  return `${plural(kept.length, 'chat stays', 'chats stay')} open. ${named}.${more}`;
}

/** The toast, or null when nothing about started chats is worth saying. */
export function startedArchiveToast(outcome: StartedOutcomeLike, context: Context): { title: string; description: string | null } | null {
  const n = outcome.archived.length;
  const description = keptLine(outcome.kept);
  if (!n && !description) {
    return context.kind === 'finished' ? { title: 'Nothing finished to archive', description: null } : null;
  }
  if (context.kind === 'parent') {
    const name = context.label?.trim() || 'the chat';
    return { title: n ? `Archived ${name} and ${plural(n, 'chat', 'chats')} it started` : `Archived ${name}`, description };
  }
  if (context.kind === 'bulk') {
    return { title: n ? `Also archived ${plural(n, 'chat', 'chats')} they started` : 'Some chats they started stay open', description };
  }
  return { title: n ? `Archived ${plural(n, 'finished chat', 'finished chats')}` : 'Nothing finished to archive', description };
}
