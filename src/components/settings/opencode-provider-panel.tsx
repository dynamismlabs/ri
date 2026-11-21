'use client';
import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';
import { NativeSelect } from '@/components/system/native-select';

import { SegmentedControl } from '@/components/system/segmented-control';

import { Button } from '@/components/system/button';

import { apiErrorStatus } from '@/lib/api/client';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import type { ProviderAuthFlow, ProviderAuthMethod, UpstreamProvider } from '@agentex/agent';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, LogOut, PlugZap, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function OpenCodeProviderPanel() {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const queryClient = useQueryClient();
  const providers = useQuery({
    queryKey: ['opencode-providers'],
    queryFn: () => trpcClient.harness.opencodeProvidersGet.query({}),
    staleTime: 30_000,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewAll, setViewAll] = useState(false);

  const allProviders = providers.data?.providers ?? [];
  const curatedTerms = ['zen', 'opencode', 'openai', 'anthropic', 'xai', 'google', 'github', 'vercel', 'openrouter'];
  const ordered = [...allProviders].sort((a, b) => {
    const rank = (provider: UpstreamProvider) => {
      const value = `${provider.id} ${provider.name}`.toLowerCase();
      const index = curatedTerms.findIndex((term) => value.includes(term));
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return Number(b.connected) - Number(a.connected) || rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  const needle = search.trim().toLowerCase();
  const visibleProviders = needle
    ? ordered.filter((provider) => `${provider.name} ${provider.id}`.toLowerCase().includes(needle))
    : viewAll
      ? ordered
      : ordered.filter((provider) => provider.connected || curatedTerms.some((term) => `${provider.id} ${provider.name}`.toLowerCase().includes(term)));

  const refresh = () => {
    void providers.refetch();
    void queryClient.invalidateQueries({ queryKey: trpc.harness.authGet.pathKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.harness.modelsGet.pathKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.homeExecutionChoices.queryKey() });
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-medium text-foreground"><PlugZap size={13} /> OpenCode providers</div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">Add API keys or complete provider OAuth through OpenCode.</p>
        </div>
        {providers.isFetching && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
      </div>
      {providers.error && (
        <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[10.5px] text-destructive">
          OpenCode provider management is unavailable. Check the installed OpenCode version.
        </p>
      )}
      <Field
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search providers"
        leading={<Search />}
        className="relative"
        aria-label={'Search providers'}
        size={compactFieldSize}
      />
      <div className="max-h-72 space-y-1 overflow-y-auto [scrollbar-width:thin]">
        {visibleProviders.map((provider) => (
          <div key={provider.id} className="rounded-md border border-border/70">
            <button
              type="button"
              onClick={() => setExpanded(expanded === provider.id ? null : provider.id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/40"
            >
              <span className={cn('h-2 w-2 rounded-full', provider.connected ? 'bg-emerald-500' : 'bg-muted-foreground/35')} />
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">{provider.name}</span>
              <span className="text-[10px] text-muted-foreground">{provider.connected ? 'Connected' : 'Set up'}</span>
            </button>
            {expanded === provider.id && (
              <ProviderSetup provider={provider} onChanged={refresh} />
            )}
          </div>
        ))}
      </div>
      {!needle && visibleProviders.length < ordered.length && (
        <Button
          onClick={() => setViewAll(true)}
          variant="ghost"
          size="xs"
        >View all providers</Button>
      )}
    </div>
  );
}

function ProviderSetup({ provider, onChanged }: { provider: UpstreamProvider; onChanged: () => void }) {
  const methods = useQuery({
    queryKey: ['opencode-provider-methods', provider.id],
    queryFn: () => trpcClient.harness.opencodeProvidersProviderIdGet.query({params: {providerId: provider.id}}),
  });
  const [methodId, setMethodId] = useState<string | null>(null);
  const method = methods.data?.methods.find((entry) => entry.id === methodId) ?? methods.data?.methods[0] ?? null;
  const [apiKey, setApiKey] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [flow, setFlow] = useState<ProviderAuthFlow | null>(null);
  const [code, setCode] = useState('');

  const setKey = useMutation({
    mutationFn: () => trpcClient.harness.opencodeProvidersProviderIdPut.mutate({
      params: { providerId: provider.id },
      body: { apiKey, ...(Object.keys(inputs).length > 0 ? { inputs } : {}) },
    }),
    onSuccess: () => {
      setApiKey('');
      setInputs({});
      toast.success(`${provider.name} connected`);
      onChanged();
    },
  });
  const beginOAuth = useMutation({
    mutationFn: () => trpcClient.harness.opencodeOauthPost.mutate({body: {
      action: 'begin',
      providerId: provider.id,
      methodId: method?.id,
      inputs,
    }}),
    onSuccess: (nextFlow) => {
      if (!('id' in nextFlow)) throw new Error('No sign-in flow was returned');
      setFlow(nextFlow);
      if (nextFlow.url) window.open(nextFlow.url, '_blank', 'noopener,noreferrer');
    },
  });
  const completeOAuth = useMutation({
    mutationFn: () => trpcClient.harness.opencodeOauthPost.mutate({body: {
      action: 'complete',
      flowId: flow?.id,
      ...(code.trim() ? { code: code.trim() } : {}),
    }}),
    onSuccess: () => {
      setFlow(null);
      setCode('');
      toast.success(`${provider.name} connected`);
      onChanged();
    },
  });
  const disconnect = useMutation({
    mutationFn: () => trpcClient.harness.opencodeProvidersProviderIdDelete.mutate({ params: { providerId: provider.id }, body: {} }),
    onSuccess: () => {
      toast.success(`${provider.name} disconnected`);
      onChanged();
    },
    onError: (error) => {
      const needsReplacement = apiErrorStatus(error) === 409;
      toast.error('Could not disconnect provider', {
        description: needsReplacement
          ? 'Choose a different default model first, then try again.'
          : error instanceof Error ? error.message : String(error),
      });
    },
  });

  if (methods.isLoading) return <div className="flex justify-center p-3"><Loader2 size={13} className="animate-spin" /></div>;

  if (provider.connected) {
    return (
      <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2">
        <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={11} /> Ready</span>
        {methods.data?.canDisconnect && (
          <Button
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
            variant="ghost"
            size="xs"
          >
            <LogOut /> Disconnect
          </Button>
        )}
      </div>
    );
  }

  if (!method) return <p className="border-t border-border/70 p-2.5 text-[10.5px] text-muted-foreground">No setup methods are available.</p>;

  return (
    <div className="space-y-2 border-t border-border/70 p-2.5">
      {(methods.data?.methods.length ?? 0) > 1 && (
        <SegmentedControl mode="choice" ariaLabel="Sign-in method" value={method.id} onChange={id => {setMethodId(id);setInputs({});setFlow(null);}} options={methods.data!.methods.map(entry => ({value:entry.id,label:entry.name}))} />
      )}
      {method.type === 'api_key' ? (
        <div className="space-y-2">
          <PromptFields
            prompts={method.prompts}
            inputs={inputs}
            onChange={(id, value) => setInputs((current) => ({ ...current, [id]: value }))}
          />
          <div className="flex gap-2">
            <Field
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={`${provider.name} API key`}
              aria-label={`${provider.name} API key`}
              purpose="code"
            />
            <Button
              disabled={!apiKey.trim() || setKey.isPending}
              onClick={() => setKey.mutate()}
              variant="primary"
              size="md"
            >
              <KeyRound /> Save
            </Button>
          </div>
        </div>
      ) : flow ? (
        <div className="space-y-2">
          {flow.instructions && <p className="text-[10.5px] text-muted-foreground">{flow.instructions}</p>}
          {flow.url && (
            <a href={flow.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:underline">
              Open authorization page <ExternalLink size={10} />
            </a>
          )}
          {flow.completion === 'code' && <Field
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Authorization code"
            aria-label={'Authorization code'}
          />}
          <Button
            disabled={(flow.completion === 'code' && !code.trim()) || completeOAuth.isPending}
            onClick={() => completeOAuth.mutate()}
            variant="primary"
            size="md"
          >
            {completeOAuth.isPending && <Loader2 className="animate-spin" />} Finish setup
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <PromptFields
            prompts={method.prompts}
            inputs={inputs}
            onChange={(id, value) => setInputs((current) => ({ ...current, [id]: value }))}
          />
          <Button
            disabled={beginOAuth.isPending}
            onClick={() => beginOAuth.mutate()}
            variant="primary"
            size="md"
          >
            {beginOAuth.isPending && <Loader2 className="animate-spin" />} Connect with {method.name}
          </Button>
        </div>
      )}
    </div>
  );
}

function PromptFields({
  prompts,
  inputs,
  onChange,
}: {
  prompts?: ProviderAuthMethod['prompts'];
  inputs: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  if (!prompts?.length) return null;
  return (
    <>
      {prompts.map((prompt) => prompt.type === 'select' ? (
        <NativeSelect
          value={inputs[prompt.id] ?? ''}
          onChange={(event) => onChange(prompt.id, event.target.value)}
          controlClassName="mt-1 w-full"
          label={prompt.label}
          key={prompt.id}
        >
          <option value="">Select</option>
          {prompt.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Field
          value={inputs[prompt.id] ?? ''}
          onChange={(event) => onChange(prompt.id, event.target.value)}
          controlClassName="mt-1"
          label={prompt.label}
          key={prompt.id}
        />
      ))}
    </>
  );
}
