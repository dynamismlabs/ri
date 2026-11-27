import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trpc, trpcClient } from '@/lib/trpc/client';

export function useRateLimitResume(sessionId: string, eventId: string) {
  const qc = useQueryClient();
  const input = { sessionId, eventId };
  const options = trpc.rateLimitResume.get.queryOptions(input);
  const status = useQuery({ ...options, retry: false, staleTime: 10_000, refetchInterval: 10_000 });
  const schedule = useMutation({
    meta: { carriesInput: true },
    mutationFn: (fields: { prompt: string; runAt?: string }) => trpcClient.rateLimitResume.schedule.mutate({ ...input, ...fields }),
    onSuccess: (data) => { qc.setQueryData(options.queryKey, data); void qc.invalidateQueries({ queryKey: ['triggers'] }); },
  });
  const cancel = useMutation({
    mutationFn: () => trpcClient.rateLimitResume.cancel.mutate(input),
    onSuccess: (result) => {
      if (result.cancelled) qc.setQueryData(options.queryKey, (current: typeof status.data) => current ? { ...current, trigger: current.trigger?.lastFiredAt ? { ...current.trigger, enabled: false, disabledReason: 'rate_limit_resume_cancelled' } : null } : current);
      void qc.invalidateQueries({ queryKey: options.queryKey });
      void qc.invalidateQueries({ queryKey: ['triggers'] });
    },
  });
  return { status, schedule, cancel };
}
