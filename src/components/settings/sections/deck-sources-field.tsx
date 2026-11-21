'use client';
import { TextArea } from '@/components/system/text-area';

import { trpcClient } from '@/lib/trpc/client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Editor for the user's deck source instructions (DECK.md). Plain-language
 * guidance the daily deck reads on every refresh — which connected services to
 * consult and how to plan the day. Loads on mount, debounced auto-save.
 */
export function DeckSourcesField() {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    trpcClient.deck.instructionsGet.query({})
      .then((r) => setContent(r.content ?? ''))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const onChange = useCallback((value: string) => {
    setContent(value);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSaving(true);
      trpcClient.deck.instructionsPut.mutate({body: { content: value }})
        .then(() => setSaved(true))
        .catch(() => {})
        .finally(() => setSaving(false));
    }, 600);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <section className="space-y-2">
      <TextArea
        id="deck-sources"
        label="Deck sources"
        description={
          <>
            Tell your deck, in plain words, how to plan your day and which connected services to use
            (your calendar, task trackers, etc.). Just write naturally — no formatting needed. The
            deck reads this on every refresh.
          </>
        }
        descriptionPosition="before"
        rows={8}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        disabled={!loaded}
        placeholder={
          'e.g. Use my calendar to size the day around meetings and slot deep work into the open gaps.\n' +
          'Pull in work I’m responsible for from my connected tools.\n' +
          'When something has a hard deadline, rank it up even if it still feels early.\n' +
          "I'm heads-down shipping right now — favor momentum over starting new things."
        }
        className="w-full"
        resize="vertical"
      />
      <p className="text-[11px] text-muted-foreground/60">
        {saving ? 'Saving…' : saved ? 'Saved' : 'Auto-saved'}
      </p>
    </section>
  );
}
