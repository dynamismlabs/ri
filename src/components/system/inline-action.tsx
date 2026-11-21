import { cva } from 'class-variance-authority';
import { ActionPrimitive, type ActionPrimitiveProps } from '@/components/ui/button';
import { toneClass, type ContentTone } from './callout';
import { cn } from '@/lib/utils';

const variants = cva('ri-inline-action', {
  variants: {
    appearance: { plain: '', link: 'ri-inline-action--link', chip: 'ri-inline-action--chip' },
    bubble: { true: 'ri-inline-action--bubble' },
  },
  defaultVariants: { appearance: 'plain' },
});
export type InlineActionProps = ActionPrimitiveProps & {
  tone?: ContentTone;
  appearance?: 'plain' | 'link' | 'chip';
  bubble?: boolean;
  code?: boolean;
};
/** Text-sized actions inside prose and content. Toolbar actions use Button sizes. */
export function InlineAction({ appearance, bubble, code, tone, className, ...props }: InlineActionProps) {
  return <ActionPrimitive {...props} className={cn(variants({ appearance, bubble }), toneClass(tone), code && 'ri-content--code', className)} />;
}
