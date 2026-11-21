'use client';

import { ChipButton } from '@/components/system/chip-button';
/**
 * Budget warning pill — TopHud's only spend signal. Silent until
 * `warn` (≥75%) or `block` (≥100%); at that point it's actionable and
 * urgent. Below 75% the indicator stays hidden because nothing about
 * spending requires the user's attention.
 *
 * Click opens the settings modal on the Models section, where the budget
 * control + the spending breakdown live (under "Usage & budget").
 */

import { AlertTriangle } from 'lucide-react';
import { useRunsStats } from '@/hooks/use-runs-stats';
import { openSettings } from '@/components/settings/settings-store';

import { Tip } from '@/components/ui/tip';

export function BudgetWarningPill() {
  const { data } = useRunsStats();
  if (!data) return null;
  if (data.budgetState === 'ok') return null;

  const pct = Math.round((data.budgetFraction ?? 0) * 100);

  const message =
    data.budgetState === 'block'
      ? `Budget exceeded. Triggers auto-paused`
      : `Budget ${pct}% used`;

  return (
    <Tip
      label={
        data.budget != null
          ? `${message}. ${pct}% of $${data.budget.toFixed(2)} monthly budget`
          : message
      }
    >
      <ChipButton
        type="button"
        aria-label={message}
        onClick={() => openSettings('models')}
        variant="secondary"
        size="compact"
        tone="status"
        status={data.budgetState === "block" ? "danger" : "warning"}
      >
        <AlertTriangle size={11} className="shrink-0" />
        <span className="hud-budget-label">{message}</span>
        <span className="hud-budget-short hidden" aria-hidden>{data.budgetState === 'block' ? 'Paused' : `${pct}%`}</span>
      </ChipButton>
    </Tip>
  );
}
