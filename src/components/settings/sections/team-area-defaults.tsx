'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/system/native-select';
import { cn } from '@/lib/utils';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAreas } from '@/hooks/use-areas';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { apiErrorText } from '@/lib/api/client';
import { Button } from '@/components/system/button';
import { invalidateTeamContent } from '@/lib/spaces/client-cache';

/** Private rules live in the personal document and use its authenticated client. */
export function TeamAreaDefaults({ teamId, connected }: { teamId: string; connected: boolean }) {
  const qc = useQueryClient();
  const rules = useQuery(trpc.spaces.areaDefaults.list.queryOptions({ id: teamId }));
  const sources = useQuery({ ...trpc.spaces.areaDefaults.sourceAreas.queryOptions({ id: teamId }), enabled: connected });
  const areas = useAreas();
  const [review, setReview] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const scope = { teamId, sourceAreaId: null };
  const preview = useQuery({ ...trpc.spaces.areaDefaults.preview.queryOptions(scope), enabled: review && connected });
  const save = useMutation({
    mutationFn: (input: { sourceAreaId: string | null; areaId: string | null }) => trpcClient.spaces.areaDefaults.set.mutate({ teamId, ...input }),
    onSuccess: () => {
      setReview(false);
      void qc.invalidateQueries({ queryKey: trpc.spaces.areaDefaults.list.queryKey({ id: teamId }) });
    },
    onError: (err) => toast.error(apiErrorText(err)),
  });
  const apply = useMutation({
    mutationFn: () => trpcClient.spaces.areaDefaults.applyExisting.mutate({ ...scope, selected: (preview.data ?? []).filter((r) => selected.includes(`${r.entityType}:${r.id}`)).map(({ entityType, id, areaId }) => ({ entityType, id, areaId })) }),
    onSuccess: ({ changed }) => {
      toast.success(`Updated ${changed} reference${changed === 1 ? '' : 's'}.`);
      setReview(false);
      invalidateTeamContent(qc);
    },
    onError: (err) => toast.error(apiErrorText(err)),
  });
  const active = (areas.data ?? []).filter((a) => a.status !== 'archived');
  const sourceIds = new Set(sources.data?.map((a) => a.id));
  const scopes = [
    { id: null, name: 'Whole team', inactive: false },
    ...(sources.data ?? []).map((a) => ({ id: a.id, name: a.name, inactive: false })),
    ...(rules.data ?? []).filter((r) => r.sourceAreaId && !sourceIds.has(r.sourceAreaId)).map((r) => ({ id: r.sourceAreaId, name: 'Unavailable team Area', inactive: true })),
  ];
  return (
    <div className="w-full space-y-3 text-xs">
      <p className="text-muted-foreground">Only you. Choose an optional personal Area for future imports and saved notes. A team Area rule takes precedence. Existing choices stay as they are.</p>
      {scopes.map((s) => {
        const rule = rules.data?.find((r) => r.sourceAreaId === s.id);
        const unavailable = !!rule && !active.some((a) => a.id === rule.areaId);
        return (
          <NativeSelect
            aria-label={`Personal Area default for ${s.name}`}
            controlClassName={cn('max-w-full', 'w-auto')}
            value={rule?.areaId ?? ''}
            disabled={save.isPending || apply.isPending}
            onChange={(e) => save.mutate({ sourceAreaId: s.id, areaId: e.target.value || null })}
            label={
              <>
                {s.name}
                {s.inactive ? ' (inactive)' : ''}
              </>
            }
            orientation="horizontal"
            className="flex-wrap w-auto"
            key={s.id ?? 'team'}
          >
            <option value="">No default</option>
            {unavailable && (
              <option value={rule.areaId}>Unavailable personal Area (inactive)</option>
            )}
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        );
      })}
      {sources.error && <p role="alert">Team Areas could not be loaded. <Button
        onClick={() => void sources.refetch()}
        variant="link"
        size="sm"
      >Retry</Button></p>}
      {!review && connected && <Button
        onClick={() => { setSelected([]); setReview(true); void preview.refetch(); }}
        variant="secondary"
        size="sm"
      >Review existing unorganized work</Button>}
      {review && (
        <div className="ri-team-area-defaults-frame space-y-2 rounded border p-3">
          <p>{preview.isFetching ? 'Checking references…' : `${preview.data?.length ?? 0} unorganized references in this team.`} Select the work to organize. Deliberately cleared Areas are excluded.</p>
          {preview.error && <p role="alert">Could not load the preview. <Button
            onClick={() => void preview.refetch()}
            variant="link"
            size="sm"
          >Retry</Button></p>}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {(preview.data ?? []).map((r) => {
              const key = `${r.entityType}:${r.id}`;
              return <label key={key} className="flex items-start gap-2"><Checkbox checked={selected.includes(key)} disabled={apply.isPending} onCheckedChange={(checked) => setSelected((old) => (checked === true) ? [...old, key] : old.filter((k) => k !== key))} /><span>{r.title || 'Untitled note'} → {active.find((a) => a.id === r.areaId)?.name ?? 'Area'}{r.requiresReview && <span className="block text-muted-foreground">Earlier choice unknown. Review before selecting.</span>}</span></label>;
            })}
          </div>
          <div className="flex gap-2"><Button
            disabled={!selected.length || apply.isPending || preview.isFetching}
            onClick={() => apply.mutate()}
            variant="primary"
            size="md"
          >Apply to {selected.length} selected</Button><Button
            disabled={apply.isPending}
            onClick={() => setReview(false)}
            variant="ghost"
            size="sm"
          >Cancel</Button></div>
        </div>
      )}
    </div>
  );
}
