'use client';
import { ChoiceRow } from '@/components/system/choice-row';

import { Field } from '@/components/system/field';

import { Button } from '@/components/system/button';
import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Palette, Shuffle, Smile, X } from 'lucide-react';
import { toast } from 'sonner';
import { APP_NAME } from '@/constants/app';
import { EmojiPicker } from '@/components/shared/emoji-picker';
import { CoordinatorMark } from '@/components/shared/coordinator-mark';
import { useUpdateUserState } from '@/hooks/use-user-state';
import { apiErrorText } from '@/lib/api/client';
import { uploadAttachment } from '@/lib/attachments/client';
import { attachmentUrl } from '@/lib/attachments/view';
import { avatarArtDataUrl, avatarArtSvg, newArtSeed } from '@/lib/coordinator/art';
import { COORDINATOR_COLORS } from '@/lib/coordinator/look';
import {
  DEFAULT_COORDINATOR_NAME,
  normalizeCoordinatorName,
  COORDINATOR_NAME_MAX,
  resolveCoordinatorName,
} from '@/lib/coordinator/name';
import { COORDINATOR_PRESETS, type CoordinatorPreset } from '@/lib/coordinator/presets';
import type { Attachment, UserStateRecord } from '@/db/types';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';

/**
 * The coordinator's name and look while they're being chosen. Nothing is
 * saved until the host says so (Continue in the first-run conversation, Save
 * in Settings and the edit dialog), so trying on a dozen looks costs nothing.
 * Art stays a seed until then and is only uploaded if it's kept.
 */
export interface IdentityDraft {
  name: string;
  emoji: string | null;
  color: string | null;
  image: { kind: 'upload'; attachment: Attachment } | { kind: 'art'; seed: number } | null;
}

/** The draft for what's stored now. */
export function draftFromState(state: UserStateRecord | undefined): IdentityDraft {
  return {
    name: resolveCoordinatorName(state?.coordinatorName),
    emoji: state?.coordinatorEmoji ?? null,
    color: state?.coordinatorColor ?? null,
    image: state?.coordinatorImage ? { kind: 'upload', attachment: state.coordinatorImage } : null,
  };
}

/** The name the draft will save, the default when it's blank. */
export function draftName(draft: IdentityDraft): string {
  return normalizeCoordinatorName(draft.name) ?? DEFAULT_COORDINATOR_NAME;
}

function draftImageUrl(draft: IdentityDraft): string | null {
  if (!draft.image) return null;
  return draft.image.kind === 'art' ? avatarArtDataUrl(draft.image.seed) : attachmentUrl(draft.image.attachment.fileName);
}

export function sameDraft(a: IdentityDraft, b: IdentityDraft): boolean {
  const imageKey = (d: IdentityDraft) =>
    !d.image ? null : d.image.kind === 'art' ? `art:${d.image.seed}` : d.image.attachment.fileName;
  return draftName(a) === draftName(b) && a.emoji === b.emoji && a.color === b.color && imageKey(a) === imageKey(b);
}

function matchesPreset(draft: IdentityDraft, preset: CoordinatorPreset): boolean {
  return draftName(draft) === preset.name && draft.emoji === preset.emoji && !draft.image;
}

/**
 * Save a draft: kept art is uploaded first, then one write carries the name
 * and the whole look. The default name is stored as null so it keeps meaning
 * "never chose" (src/lib/coordinator/name.ts).
 */
export function useSaveIdentity() {
  const update = useUpdateUserState();
  const [saving, setSaving] = useState(false);
  const save = async (draft: IdentityDraft): Promise<boolean> => {
    setSaving(true);
    try {
      let image: Attachment | null = null;
      if (draft.image?.kind === 'upload') image = draft.image.attachment;
      if (draft.image?.kind === 'art') {
        const svg = new Blob([avatarArtSvg(draft.image.seed)], { type: 'image/svg+xml' });
        image = await uploadAttachment(svg, `${draftName(draft)} art.svg`);
      }
      const name = draftName(draft);
      await update.mutateAsync({
        coordinatorName: name === DEFAULT_COORDINATOR_NAME ? null : name,
        coordinatorEmoji: draft.emoji,
        coordinatorColor: draft.color,
        coordinatorImage: image,
      });
      return true;
    } catch (err) {
      toast.error('Couldn’t save that', { description: apiErrorText(err) });
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

/**
 * Name and look, edited together: a preview, the name, ideas to start from,
 * and the look (emoji, a picture, art, a color). Shared by the main chat's
 * first run, Settings and the rail's edit dialog, so it is one editor
 * everywhere and a change made in one shows in the others.
 */
export function IdentityEditor({
  draft,
  onChange,
  onSubmit,
  autoFocusName = false,
  className,
}: {
  draft: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
  /** Enter in the name field. */
  onSubmit?: () => void;
  autoFocusName?: boolean;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const name = draftName(draft);
  const set = (patch: Partial<IdentityDraft>) => onChange({ ...draft, ...patch });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const attachment = await uploadAttachment(file);
      set({ image: { kind: 'upload', attachment } });
    } catch (err) {
      toast.error('Couldn’t upload that picture', { description: apiErrorText(err) });
    } finally {
      setUploading(false);
    }
  };

  return (
    // min-w-0: the ideas row scrolls sideways, and inside a grid (the dialog)
    // it would otherwise widen its track and push everything off the edge.
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-center gap-3">
        <CoordinatorMark
          name={name}
          emoji={draft.emoji}
          color={draft.color}
          imageUrl={draftImageUrl(draft)}
          size="xl"
          className="shadow-sm"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Field
            autoFocus={autoFocusName}
            value={draft.name}
            maxLength={COORDINATOR_NAME_MAX}
            onChange={(e) => set({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit?.();
              }
            }}
            placeholder={APP_NAME}
            aria-label="Assistant name"
            className="w-full"
          />
          <div className="flex flex-wrap items-center gap-1">
            <EmojiPicker onSelect={(emoji) => set({ emoji, image: null })}>
              <LookButton active={!!draft.emoji && !draft.image} label="Emoji">
                {draft.emoji ? <span className="text-[13px] leading-none">{draft.emoji}</span> : <Smile size={12} />}
              </LookButton>
            </EmojiPicker>
            <LookButton
              label="Picture"
              active={draft.image?.kind === 'upload'}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
            </LookButton>
            <LookButton
              label={draft.image?.kind === 'art' ? 'New art' : 'Make art'}
              active={draft.image?.kind === 'art'}
              onClick={() => set({ image: { kind: 'art', seed: newArtSeed() } })}
            >
              {draft.image?.kind === 'art' ? <Shuffle size={12} /> : <Palette size={12} />}
            </LookButton>
            {(draft.image || draft.emoji) && (
              <Button
                type="button"
                onClick={() => set(draft.image ? { image: null } : { emoji: null })}
                variant="ghost"
                size="xs"
                className="inline-flex items-center gap-1"
              >
                <X size={11} />
                {draft.image ? 'Remove picture' : 'Remove emoji'}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(file);
              }}
            />
          </div>
        </div>
      </div>

      <ColorRow color={draft.color} disabled={!!draft.image} onPick={(color) => set({ color })} />

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground/70">Ideas</span>
        <div
          className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:thin]"
          style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
        >
          {COORDINATOR_PRESETS.map((preset) => {
            const selected = matchesPreset(draft, preset);
            return (
              <Tip key={preset.name} label={preset.note} onlyWhenTextHidden>
                <ChoiceRow density="compact"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ name: preset.name, emoji: preset.emoji, color: preset.color, image: null })}
                  className="flex w-36 flex-shrink-0 snap-start items-center gap-2 text-left"
                >
                  <CoordinatorMark name={preset.name} emoji={preset.emoji} color={preset.color} size="md" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[12px] font-medium text-foreground">{preset.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{preset.note}</span>
                  </span>
                </ChoiceRow>
              </Tip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A look control. Spreads the rest so it can be a popover's trigger (the emoji picker). */
function LookButton({
  label,
  active,
  className,
  children,
  ...rest
}: React.ComponentProps<'button'> & { label: string; active?: boolean }) {
  return (
    <Button
      aria-pressed={active}
      type="button"
      {...rest}
      variant="secondary"
      size="xs"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {children}
      {label}
    </Button>
  );
}

/** The palette, plus the theme's own color. A picture covers the color, so it waits until there's none. */
function ColorRow({
  color,
  disabled,
  onPick,
}: {
  color: string | null;
  disabled: boolean;
  onPick: (color: string | null) => void;
}) {
  return (
    <Tip label={disabled ? 'A picture covers the color. Remove it to pick one.' : undefined}>
      <div
        role="radiogroup"
        aria-label="Color"
        className={cn('flex flex-wrap items-center gap-1.5', disabled && 'pointer-events-none opacity-40')}
      >
        <Swatch label="Theme" selected={color === null} onClick={() => onPick(null)} className="bg-primary" />
        {COORDINATOR_COLORS.map((c) => (
          <Swatch key={c.hex} label={c.label} selected={color === c.hex} onClick={() => onPick(c.hex)} style={{ backgroundColor: c.hex }} />
        ))}
      </div>
    </Tip>
  );
}

function Swatch({
  label,
  selected,
  onClick,
  className,
  style,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Tip label={label}>
      <button data-native-action="ri-identity-swatch"
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        onClick={onClick}
        style={style}
        className={cn(
          'size-5 rounded-full ring-offset-2 ring-offset-background transition-shadow',
          selected ? 'ring-2 ring-foreground/70' : 'hover:ring-2 hover:ring-foreground/25',
          className,
        )}
      />
    </Tip>
  );
}
