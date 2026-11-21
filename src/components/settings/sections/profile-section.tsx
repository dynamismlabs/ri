'use client';
import { Field } from '@/components/system/field';
import { TextArea } from '@/components/system/text-area';

import { Button } from '@/components/system/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserState, useUpdateUserState } from '@/hooks/use-user-state';
import {
  IdentityEditor,
  draftFromState,
  sameDraft,
  useSaveIdentity,
  type IdentityDraft,
} from '@/components/orchestrator/identity-editor';
import { DeckSourcesField } from './deck-sources-field';

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Your identity + the free-form context the agents build on. Your name saves
 * on blur; the assistant's name and look (the orchestrator) save with their
 * own button, since trying on looks shouldn't change it; the "about you"
 * description debounced-saves to `user_state.description`.
 * Profile context supports planning and the app's background assistance.
 */
export function ProfileSection() {
  const { data: userState } = useUserState();
  const updateUserState = useUpdateUserState();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Null until the user touches it, so the editor shows what's stored
  // (including a change made from the rail) without an effect copying it in.
  const [assistantDraft, setAssistantDraft] = useState<IdentityDraft | null>(null);
  const storedIdentity = draftFromState(userState);
  const identity = assistantDraft ?? storedIdentity;
  const identityDirty = assistantDraft !== null && !sameDraft(assistantDraft, storedIdentity);
  const { save: saveIdentity, saving: savingIdentity } = useSaveIdentity();
  const commitIdentity = async () => {
    if (!assistantDraft) return;
    if (await saveIdentity(assistantDraft)) {
      setAssistantDraft(null);
      setLastSavedAt(new Date());
    }
  };

  // The stored name and description fill their fields when they load or change
  // elsewhere. Set while rendering, so a field never paints the previous value.
  // Undefined means not filled yet: a stored name is a string or null.
  const [nameFrom, setNameFrom] = useState<string | null | undefined>(undefined);
  if (userState && userState.name !== nameFrom) {
    setNameFrom(userState.name);
    setName(userState.name ?? '');
  }
  const [descriptionFrom, setDescriptionFrom] = useState<string | undefined>(undefined);
  if (userState && userState.description !== descriptionFrom) {
    setDescriptionFrom(userState.description);
    setDescription(userState.description);
  }

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateUserState.mutate({ description: value }, { onSuccess: () => setLastSavedAt(new Date()) });
      }, 500);
    },
    [updateUserState],
  );

  const commitName = useCallback(() => {
    const next = name.trim();
    if (next === (userState?.name ?? '')) return;
    updateUserState.mutate({ name: next || null }, { onSuccess: () => setLastSavedAt(new Date()) });
  }, [name, userState?.name, updateUserState]);

  // Keep "last saved" fresh.
  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  return (
    <div className="space-y-5">
      {/* Why this matters — the pitch, up front and unmuted. */}
      <div className="rounded-xl border border-primary/20 border-l-2 border-l-primary bg-primary/5 p-4">
        <p className="text-[12.5px] leading-relaxed text-foreground/90">
          Share your role, how you work, and what you&apos;re focused on to give your daily plan more useful context.
        </p>
      </div>

      {/* Name */}
      <Field
        id="profile-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="e.g. Trey"
        controlClassName="w-full max-w-sm"
        label="What should your assistant call you?"
      />

      {/* The assistant (the orchestrator): its name and look */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Your assistant</h3>
        <div className="max-w-xl rounded-xl border border-border bg-card/40 p-3">
          <IdentityEditor draft={identity} onChange={setAssistantDraft} onSubmit={() => void commitIdentity()} />
          {identityDirty && (
            <div className="mt-3 flex items-center justify-end gap-1.5">
              <Button
                type="button"
                onClick={() => setAssistantDraft(null)}
                variant="ghost"
                size="sm"
              >
                Reset
              </Button>
              <Button
                type="button"
                onClick={() => void commitIdentity()}
                disabled={savingIdentity}
                variant="primary"
                size="md"
              >
                Save
              </Button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          The name and face at the top of the rail and in your main chat. It answers to the name.
        </p>
      </section>

      {/* About you */}
      <TextArea
        rows={9}
        id="profile-about"
        value={description}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        placeholder="e.g. I'm a founder building a B2B SaaS product. I do my best deep work before noon. I tend to procrastinate on financial tasks..."
        controlClassName="w-full"
        resize="vertical"
        label="About you"
        description={
          updateUserState.isPending
            ? 'Saving…'
            : lastSavedAt
              ? `Last saved ${timeAgo(lastSavedAt)}`
              : 'Auto-saved'
        }
      />

      {/* Deck sources (DECK.md) — which connected services the deck consults. */}
      <DeckSourcesField />
    </div>
  );
}
