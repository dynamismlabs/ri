'use client';

import { SegmentedControl } from '@/components/system/segmented-control';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/system/button';

import { ModelList } from '@/components/settings/model-list';
import { useHarnessModels } from '@/hooks/use-harness-models';
import { apiErrorText } from '@/lib/api/client';
import {
  defaultModelFor,
  effortOptionsForModel,
  explicitEffortForModel,
  explicitVariantForModel,
  harnessSupportsEffort,
  type ModelOption,
  type ProviderId,
} from '@/lib/harness/options';
import { DEFAULT_HARNESS } from '@/lib/harness/registry';

import type { EffortLevel } from '@/db/types';
import { serviceTierForModel, serviceTierOptions } from '@/lib/harness/service-tiers';

export interface DefaultSelectionDraft {
  harness: ProviderId;
  model: string;
  variant: string | null;
  effort: EffortLevel | null;
  serviceTier?: string | null;
}

/**
 * Pick the global default model: harness and model from the same list the
 * model menus use (every harness, each with its sign-in state, so one that
 * isn't signed in can't be picked), then the effort that model offers.
 * Nothing is saved until Save. Shared by Settings and first-run setup, which
 * decide what saving does (`onSave`) and where the editor sits.
 */
export function DefaultSelectionEditor({
  current,
  onSave,
  onClose,
  note,
}: {
  /** The saved default, or null when the home hasn't chosen one. */
  current: DefaultSelectionDraft | null;
  onSave: (selection: DefaultSelectionDraft) => Promise<unknown>;
  onClose: () => void;
  /** One line beside the buttons on what the default does. */
  note: string;
}) {
  const [draft, setDraft] = useState<DefaultSelectionDraft>(
    current ?? { harness: DEFAULT_HARNESS, model: defaultModelFor(DEFAULT_HARNESS), variant: null, effort: null },
  );
  const [saving, setSaving] = useState(false);
  const { models } = useHarnessModels(draft.harness);
  const option = models.find((m) => m.id === draft.model) ?? null;
  const efforts = effortOptionsForModel(draft.harness, option);
  const speeds = serviceTierOptions(option);
  const changed =
    !current ||
    draft.harness !== current.harness ||
    draft.model !== current.model ||
    draft.variant !== current.variant ||
    draft.effort !== current.effort ||
    draft.serviceTier !== current.serviceTier;

  const pick = (harness: ProviderId, model: ModelOption) =>
    setDraft((d) => ({
      harness,
      model: model.id,
      variant: explicitVariantForModel(model, d.harness === harness ? d.variant : null),
      serviceTier: serviceTierForModel(model, d.harness === harness ? d.serviceTier : null),
      // Keep the effort already chosen when the new model has it, else its own.
      effort: harnessSupportsEffort(harness) ? explicitEffortForModel(harness, model, d.effort) : null,
    }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...draft, serviceTier: draft.serviceTier ?? serviceTierForModel(option) });
      onClose();
    } catch (err) {
      toast.error('Couldn’t change the default', { description: apiErrorText(err) });
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="max-h-72 overflow-y-auto pr-1">
        <ModelList selected={{ harness: draft.harness, model: draft.model }} onPick={pick} />
      </div>
      {efforts.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">Effort</div>
          <SegmentedControl mode="choice" selection="radio" ariaLabel="Effort" value={draft.effort} onChange={effort => setDraft(d => ({...d,effort}))} options={efforts.map(o => ({value:o.id,label:o.label,hint:o.hint}))} />
        </div>
      )}
      {speeds.some(speed => speed.id !== 'default') && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">Speed</div>
          <SegmentedControl mode="choice" selection="radio" ariaLabel="Speed" value={draft.serviceTier ?? 'default'} onChange={serviceTier => setDraft(d => ({...d,serviceTier}))} options={speeds.map(speed => ({value:speed.id,label:speed.label,hint:speed.hint,disabled:speed.disabled}))} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="min-w-0 text-[10.5px] text-muted-foreground">{note}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!changed || saving}
            onClick={() => void save()}
            variant="primary"
            size="md"
          >
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
