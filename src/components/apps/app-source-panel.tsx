'use client';
import { Field } from '@/components/system/field';
import { TextArea } from '@/components/system/text-area';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FolderGit2 } from 'lucide-react';
import { Button } from '@/components/system/button';

import { APP_NAME } from '@/constants/app';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { useCatalogApp } from './app-catalog';
import { AppStatusLine } from './app-status';

/**
 * Where an app's source lives (docs/personal-apps.md "Building and changing apps"), so Ri can fix
 * it later. An app Ri made changes through its builder and the kit's safe-change command. For an
 * app Ri didn't make, the person records its folder or git URL, and how it's built and deployed.
 */
export function AppSourcePanel({ appId, appName, onOpenBuild }: { appId: string; appName: string; onOpenBuild: (sourceId: string) => void }) {
  const queryClient = useQueryClient();
  const source = useQuery(trpc.appBuilds.forApp.queryOptions({ personalAppId: appId }));
  const [folder, setFolder] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: async (id: string) => { await trpcClient.appBuilds.startChange.mutate({ id }); return id; },
    onSuccess: (id) => { void queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() }); onOpenBuild(id); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const record = useMutation({
    mutationFn: () => trpcClient.appBuilds.recordSource.mutate({ personalAppId: appId, name: appName, folder: folder || null, gitUrl: gitUrl || null, notes: notes || null }),
    onSuccess: () => { setEditing(false); setError(null); void queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() }); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const catalogApp = useCatalogApp(source.data?.id);
  if (source.isPending) return null;
  const data = source.data;

  return (
    <section aria-labelledby="app-source" className="space-y-2">
      <h2 id="app-source" className="flex items-center gap-1.5 text-sm font-medium"><FolderGit2 size={14} aria-hidden />Its source</h2>
      {error && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</p>}
      {data ? (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">{data.folder ?? data.gitUrl}{data.notes ? `. ${data.notes}` : ''}</p>
          {data.createdByRi && data.url && data.folder && <AppStatusLine sourceId={data.id} name={data.name} />}
          {catalogApp && (
            <p className="text-muted-foreground">
              From {APP_NAME}&apos;s catalog, {catalogApp.installedVersion ?? 'unknown version'}.
              {catalogApp.updateAvailable && <> {catalogApp.version} is available. <Button
                type="button"
                onClick={() => onOpenBuild(data.id)}
                variant="link"
                size="sm"
              >Update</Button></>}
            </p>
          )}
          {data.createdByRi && (
            <div className="flex flex-wrap gap-2">
              {data.changeFolder
                ? <Button
                  onClick={() => onOpenBuild(data.id)}
                  variant="secondary"
                  size="xs"
                >Continue the change</Button>
                : <Button
                  disabled={change.isPending}
                  onClick={() => change.mutate(data.id)}
                  variant="secondary"
                  size="xs"
                >Change app</Button>}
              <span className="self-center text-muted-foreground">An agent works on a copy. {APP_NAME} switches over only after the kit&apos;s checks pass.</span>
            </div>
          )}
        </div>
      ) : editing ? (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); record.mutate(); }}>
          <Field value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Its folder, like /Users/you/apps/bloom" />
          <Field value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="Or its git URL" />
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="How it's built and deployed" autoSize />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={record.isPending || (!folder.trim() && !gitUrl.trim())}
              variant="primary"
              size="md"
            >Save</Button>
            <Button
              type="button"
              onClick={() => setEditing(false)}
              variant="ghost"
              size="xs"
            >Cancel</Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          {APP_NAME} didn&apos;t make {appName}. <Button
            type="button"
            onClick={() => setEditing(true)}
            variant="link"
            size="sm"
          >Say where its source is</Button> so {APP_NAME} can fix it later.
        </p>
      )}
    </section>
  );
}
