import { cva } from 'class-variance-authority';
import { Button, type ButtonProps, type ButtonTone } from '@/components/ui/button';
import type { PermissionMode } from '@/db/types';
import { cn } from '@/lib/utils';

const chipVariants = cva('ri-chip', {
  variants: { size: { compact: 'ri-chip--compact', touch: 'ri-chip--touch' } },
  defaultVariants: { size: 'compact' },
});

type StatusTone = Exclude<ButtonTone, `mode-${string}`>;
type ChipTone =
  | { tone?: 'neutral' | 'attention'; status?: never; mode?: never }
  | { tone: 'status'; status: StatusTone; mode?: never }
  | { tone: 'mode'; mode: PermissionMode; status?: never };

export type ChipButtonProps = Omit<ButtonProps, 'size' | 'tone'> & ChipTone & {
  size?: 'compact' | 'touch';
};

const MODE_TONES: Record<PermissionMode, ButtonTone> = {
  auto_all: 'mode-auto', auto_edits: 'mode-edits', ask: 'mode-ask', plan: 'mode-plan',
};

/** A toolbar, filter or status action. Facts without an action use StatusBadge. */
export function ChipButton({ size = 'compact', tone = 'neutral', status, mode, className, variant = 'secondary', ...props }: ChipButtonProps) {
  const ink = tone === 'mode' ? MODE_TONES[mode!] : tone === 'status' ? status! : tone === 'attention' && !props.pressed && props['aria-pressed'] !== true ? 'neutral' : tone;
  return <Button {...props} variant={variant} size={size === 'touch' ? 'touch' : 'sm'} tone={ink} className={cn(chipVariants({ size }), className)} />;
}
