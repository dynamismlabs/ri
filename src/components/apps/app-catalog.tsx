'use client';

/**
 * A catalog app's updates (docs/personal-apps.md "The catalog"). Discover lists the catalog
 * (layout-review/catalog.ts), and each added app's page offers its update.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { ensureAppBuilderChat } from './new-app-dialog';

/**
 * Update an app added from the catalog (docs/personal-apps.md "The catalog"). When the person
 * changed the app, Ri opens a change and this asks the builder to merge the update there first.
 */
export function useCatalogUpdate(sourceId: string | null, onDone?: (mode: 'current' | 'switch' | 'merge') => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const update = await trpcClient.appBuilds.updateFromCatalog.mutate({ id: sourceId! });
      if (update.mode === 'merge') {
        const chat = await ensureAppBuilderChat(sourceId!);
        await trpcClient.sessions.messagesPost.mutate({ params: { id: chat.id }, body: { id: uuidv7(), content: update.message } });
      }
      return update.mode;
    },
    onSuccess: (mode) => onDone?.(mode),
    onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() }),
  });
}

/** One catalog app's update, where the app has one. */
export function useCatalogApp(sourceId: string | null | undefined) {
  const catalog = useQuery({ ...trpc.appBuilds.catalog.queryOptions(undefined, { staleTime: 60_000 }), enabled: !!sourceId });
  return catalog.data?.apps.find((app) => app.sourceId === sourceId) ?? null;
}
