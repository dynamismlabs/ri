import { getAppRoot } from '@/lib/config/paths';
import { HARNESS_REGISTRY, type HarnessId } from '@/lib/harness/registry';
import { assertServiceTier, serviceTierForModel } from '@/lib/harness/service-tiers';
import { effortIsVariant, explicitHarnessSelection, variantEfforts, type ModelOption } from '@/lib/harness/options';
import type { EffortLevel, TriggerRecord } from '@/db/types';

/** Scheduled NULL models use the first runnable catalog entry at dispatch. */
export async function triggerSpeedModel(harness: HarnessId, model: string | null | undefined) {
  const { getHarnessModelCatalog } = await import('@/lib/harness/model-discovery');
  const catalog = await getHarnessModelCatalog(harness, { cwd: getAppRoot() });
  return catalog.find(option => option.id === model) ?? (model == null ? catalog[0] : undefined);
}

/** Only new or changed selections initialize speed. Never retune an existing NULL row. */
export async function speedForTriggerModel(harness: HarnessId, model: string | null | undefined, preferred?: string | null) {
  if (!HARNESS_REGISTRY[harness].maximumCapabilities.serviceTiers) return null;
  return serviceTierForModel(await triggerSpeedModel(harness, model), preferred);
}

/**
 * Reject an effort the model can't run, where its effort levels are its own
 * variants (`effortIsVariant`). Other harnesses resolve effort against the
 * model's ladder at dispatch, as they always have.
 */
export function assertTriggerEffort(harness: HarnessId, model: ModelOption | null | undefined, effort: EffortLevel | null | undefined): void {
  if (effort == null || !effortIsVariant(harness)) return;
  if (!model) throw new Error('Choose an available model before choosing its effort.');
  if (!variantEfforts(model).includes(effort)) {
    throw new Error(`${model.label} doesn't offer ${effort} effort. Refresh models or choose another effort.`);
  }
}

/**
 * The effort a schedule keeps when its model changes and the change doesn't
 * restate it: the same level when the new model offers it, else the model's
 * default. Only levels that are a model's own variants depend on the model.
 */
export async function effortForTriggerModel(harness: HarnessId, model: string | null | undefined, current: EffortLevel | null): Promise<EffortLevel | null> {
  if (current == null || !effortIsVariant(harness)) return current;
  return variantEfforts(await triggerSpeedModel(harness, model)).includes(current) ? current : null;
}

/** One live model/effort/speed snapshot for every chat created by a fire. */
export async function resolveTriggerSelection(trigger: Pick<TriggerRecord, 'harness' | 'model' | 'effort' | 'serviceTier'>) {
  const model = await triggerSpeedModel(trigger.harness, trigger.model);
  if (!model) throw new Error(`Model ${trigger.model ?? '(provider default)'} is unavailable for ${trigger.harness}. Refresh models or choose an available model.`);
  assertServiceTier(model, trigger.serviceTier);
  // A level the model stopped offering fails the fire rather than quietly
  // running on another one, like a missing model above.
  assertTriggerEffort(trigger.harness, model, trigger.effort);
  const modelCatalog = [model];
  // Where effort levels are variants, the level reaches the harness as one.
  const asVariant = effortIsVariant(trigger.harness);
  const selection = explicitHarnessSelection(
    trigger.harness,
    {
      model: trigger.model,
      variant: asVariant ? trigger.effort : undefined,
      effort: asVariant ? null : trigger.effort,
      serviceTier: trigger.serviceTier,
    },
    modelCatalog,
  );
  // Dispatch never initializes a legacy NULL. An explicit tier is canonicalized
  // against this same model, without inheriting a provider's paid default.
  selection.serviceTier = trigger.serviceTier == null ? null : serviceTierForModel(model, trigger.serviceTier);
  return { selection, modelCatalog };
}
