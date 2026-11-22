import { cva } from 'class-variance-authority';
import { ActionPrimitive, type ActionPrimitiveProps } from '@/components/ui/button';
import { toneClass, type ContentTone } from './callout';
import { cn } from '@/lib/utils';

const variants = cva('ri-inline-action', {
  variants: {
    appearance: { plain: '', control: 'ri-inline-action--control', link: 'ri-inline-action--link', chip: 'ri-inline-action--chip' },
    dimmed: { true: 'ri-content--dimmed' },
    bubble: { true: 'ri-inline-action--bubble' },
    purpose: { inherit: '', caption: 'ri-inline-action--caption', body: 'ri-inline-action--body', label: 'ri-inline-action--label', heading: 'ri-inline-action--heading' },
  },
  defaultVariants: { appearance: 'plain' },
});
export type InlineActionProps = ActionPrimitiveProps & {
  tone?: ContentTone;
  appearance?: 'plain' | 'link' | 'chip' | 'control';
  bubble?: boolean;
  dimmed?: boolean;
  code?: boolean;
  purpose?: 'inherit' | 'caption' | 'body' | 'label' | 'heading';
};
/** Text-sized actions inside prose and content. Toolbar actions use Button sizes. */
export function InlineAction({ appearance, bubble, purpose, dimmed, code, tone, className, ...props }: InlineActionProps) {
  return <ActionPrimitive {...props} className={cn(variants({ appearance, bubble, purpose, dimmed }), toneClass(tone), code && 'ri-content--code', className)} />;
}
