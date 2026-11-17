/**
 * The integration registry (§3/§4). Holds providers + toolkits, derives the flat
 * action map, and enforces two invariants at registration time:
 *   1. provider / toolkit / action ids are globally unique;
 *   2. every action's `input` is a Zod *object* schema — the projection (§11)
 *      injects an `account` field, which only works on object schemas, so a
 *      union/non-object input is rejected here rather than breaking silently.
 */
import { z } from 'zod';
import { IntegrationError } from './errors';
import type { Action, Provider, Toolkit } from './types';

export interface ResolvedAction {
  action: Action;
  toolkit: Toolkit;
  provider: Provider;
}

export interface Registry {
  addProvider(provider: Provider): void;
  addToolkit(toolkit: Toolkit): void;
  addBundle(bundle: { provider: Provider; toolkits: Toolkit[] }): void;
  getProvider(id: string): Provider | undefined;
  getToolkit(id: string): Toolkit | undefined;
  getAction(id: string): ResolvedAction | undefined;
  providers(): Provider[];
  toolkits(): Toolkit[];
}

function isZodObject(schema: unknown): boolean {
  if (schema instanceof z.ZodObject) return true;
  // Defensive duck-type for cross-zod-version safety.
  const def = (schema as { _def?: { typeName?: string; shape?: unknown } } | undefined)?._def;
  return def?.typeName === 'ZodObject' || def?.shape !== undefined;
}

export function createRegistry(): Registry {
  const providers = new Map<string, Provider>();
  const toolkits = new Map<string, Toolkit>();
  const actions = new Map<string, ResolvedAction>();

  function addToolkit(toolkit: Toolkit): void {
    const provider = providers.get(toolkit.providerId);
    if (!provider) {
      throw new IntegrationError(
        'internal_error',
        `toolkit "${toolkit.id}" references unknown provider "${toolkit.providerId}" (register the provider first)`,
      );
    }
    if (toolkits.has(toolkit.id)) {
      throw new IntegrationError('internal_error', `duplicate toolkit id "${toolkit.id}"`);
    }
    for (const action of toolkit.actions) {
      if (actions.has(action.id)) {
        throw new IntegrationError('internal_error', `duplicate action id "${action.id}"`);
      }
      if (!isZodObject(action.input)) {
        throw new IntegrationError(
          'internal_error',
          `action "${action.id}" input must be a Zod object schema (the projections add an \`account\` field to it)`,
        );
      }
      // An action may declare its own `account`, as a connected MCP server's tool does: the
      // projections then add no account selector over it and pass it through (`ownsAccountField`).
    }
    toolkits.set(toolkit.id, toolkit);
    for (const action of toolkit.actions) actions.set(action.id, { action, toolkit, provider });
  }

  return {
    addProvider(provider) {
      if (providers.has(provider.id)) {
        throw new IntegrationError('internal_error', `duplicate provider id "${provider.id}"`);
      }
      providers.set(provider.id, provider);
    },
    addToolkit,
    addBundle({ provider, toolkits: tks }) {
      if (providers.has(provider.id)) {
        throw new IntegrationError('internal_error', `duplicate provider id "${provider.id}"`);
      }
      providers.set(provider.id, provider);
      for (const t of tks) addToolkit(t);
    },
    getProvider: (id) => providers.get(id),
    getToolkit: (id) => toolkits.get(id),
    getAction: (id) => actions.get(id),
    providers: () => [...providers.values()],
    toolkits: () => [...toolkits.values()],
  };
}
