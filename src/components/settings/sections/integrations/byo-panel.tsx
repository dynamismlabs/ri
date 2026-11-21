'use client';
import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { Check, Copy, ExternalLink, Plus } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/system/button';

import { Label } from '@/components/ui/label';
import { integrationMeta } from '@/components/integrations/integration-meta';
import { APP_NAME } from '@/constants/app';
import { isRegisteredMcp, oauthAppRedirectUri, type AuthConfigSummary, type ByoForm, type ProviderStatus } from './types';

import { SlackAccountSetup } from './slack-account-setup';

/**
 * Bring-your-own OAuth app for an OAuth provider: the redirect URI to register,
 * the apps already added (connect / make default / remove), and a form to add
 * one. The client is stored sealed in the user's home, never in the repo. The
 * host supplies the heading: it is the whole connect flow for providers with no
 * bundled client, and an Advanced disclosure for the rest.
 */
export function ByoPanel({
  provider,
  redirectUri,
  copied,
  onCopyRedirect,
  configs,
  form,
  busy,
  onField,
  onAdd,
  onConnect,
  onSetDefault,
  onDelete,
  connectDisabled = false,
  usedAuthConfigIds = [],
}: {
  provider: ProviderStatus;
  redirectUri: string;
  copied: boolean;
  onCopyRedirect: () => void;
  configs: AuthConfigSummary[];
  form: ByoForm;
  busy: boolean;
  onField: (field: keyof ByoForm, value: string) => void;
  onAdd: () => void;
  onConnect: (authConfigId: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  connectDisabled?: boolean;
  usedAuthConfigIds?: string[];
}) {
  const { docsUrl, appUrl, setup } = integrationMeta(provider.id);
  const registered = isRegisteredMcp(provider);
  const boundClientId = registered ? provider.mcp?.authConfigId : undefined;
  const callback = oauthAppRedirectUri(provider, redirectUri);
  const formId = useId();
  const callbackFields = <>
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground">{registered ? callback || 'Callback address unavailable' : provider.desktopCallback ? provider.desktopCallback.kind === 'loopback' ? 'http://127.0.0.1:<temporary-port>/oauth/callback' : provider.desktopCallback.redirectUri || 'Configure a hosted callback service first' : redirectUri}</code>

          <IconButton
            disabled={registered ? !callback : !!provider.desktopCallback && !provider.desktopCallback.redirectUri}
            onClick={onCopyRedirect}
            label="Copy redirect URI"
            tooltip="Copy redirect URI"
            variant="ghost"
            size="xs"
          >
            {copied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
          </IconButton>

      </div>
      {(registered || !provider.desktopCallback) && (
        <p className="text-[11px] leading-normal text-muted-foreground">
          This follows {APP_NAME}&apos;s address in Devices, and every sign-in uses it. If that address changes, add the new
          one to your app on {provider.displayName} too.
        </p>
      )}

      {boundClientId && <p className="text-[11px] text-muted-foreground">This connection uses {configs.find(config => config.id === boundClientId)?.label ?? boundClientId}. Disconnect before changing or removing its OAuth app.</p>}
  </>;
  const savedApps = <>
      {configs.length > 0 && (
        <div className="space-y-1.5">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px]"
            >
              <span className="min-w-0 truncate text-foreground">
                {cfg.label ?? cfg.id}
                {cfg.isDefault && <span className="ml-1 text-muted-foreground">· default</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Button
                  aria-label={`Connect using ${cfg.label ?? cfg.id}`}
                  onClick={() => onConnect(cfg.id)}
                  disabled={busy || connectDisabled || cfg.status !== 'active' || (!!boundClientId && cfg.id !== boundClientId)}
                  variant="link"
                  size="sm"
                  className="inline-flex items-center gap-1"
                >
                  <ExternalLink size={11} /> Connect
                </Button>
                {!cfg.isDefault && (
                  <Button
                    aria-label={`Make ${cfg.label ?? cfg.id} default`}
                    onClick={() => onSetDefault(cfg.id)}
                    disabled={busy}
                    variant="ghost"
                    size="sm"
                  >
                    Default
                  </Button>
                )}
                <Button
                  aria-label={`Remove ${cfg.label ?? cfg.id}`}
                  onClick={() => onDelete(cfg.id)}
                  disabled={busy || cfg.id === boundClientId || usedAuthConfigIds.includes(cfg.id)}
                  variant="link"
                  size="sm"
                  tone="danger"
                >
                  Remove
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
  </>;
  const credentials = <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`${formId}-label`}>App label in Ri</Label>
        <Field id={`${formId}-label`}
          value={form.label}
          onChange={(e) => onField('label', e.target.value)}
          placeholder="Label (e.g. Work)"

        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`${formId}-client-id`}>Client ID</Label>
        <Field id={`${formId}-client-id`}
          value={form.clientId}
          onChange={(e) => onField('clientId', e.target.value)}
          placeholder="Client ID"
           purpose="code"
        />
      </div>
      <div className="space-y-1 @lg:col-span-2">
        <Label className="text-xs" htmlFor={`${formId}-client-secret`}>{registered ? 'Client secret' : 'Client secret (if required)'}</Label>
        <Field id={`${formId}-client-secret`}
          type="password"
          autoComplete="off"
          value={form.clientSecret}
          onChange={(e) => onField('clientSecret', e.target.value)}
          placeholder={registered ? 'Client secret' : 'Client secret (if required)'}
          required={registered}
           purpose="code"
        />
      </div>
    </div>;
  const saveAction = <Button
    onClick={onAdd}
    disabled={busy || !form.label.trim() || !form.clientId.trim() || (registered && (!callback || !form.clientSecret.trim()))}
    variant="secondary"
    size="sm"
  >
        <Plus size={14} /> {provider.id === 'slack' ? busy ? 'Saving app…' : 'Save app and continue' : 'Add app'}
      </Button>;

  if (provider.id === 'slack' && registered) {
    return <SlackAccountSetup redirectUri={callback} callbackFields={callbackFields} credentials={credentials} saveAction={saveAction} savedApps={savedApps} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-normal text-muted-foreground">
        {!registered && provider.desktopCallback?.kind === 'loopback'
          ? `Create a desktop or native OAuth app with ${provider.displayName} that accepts loopback redirects on a temporary port. Paste its client ID below.`
          : `Register an app with ${provider.displayName}, add the callback address below, then paste the client below.`}
        {' '}Credentials are stored encrypted in your Ri.
      </p>
      {setup && setup.length > 0 && (
        <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-normal text-muted-foreground">
          {setup.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}
      {(appUrl || docsUrl) && (
        <div className="flex flex-wrap gap-3 text-[11px]">
          <a href={appUrl ?? docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            {appUrl ? `Create an app on ${provider.displayName}` : 'Setup guide'} <ExternalLink size={11} />
          </a>
          {appUrl && docsUrl && <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:underline">Reference docs</a>}
        </div>
      )}
      {callbackFields}
      {savedApps}
      {credentials}
      {saveAction}
    </div>
  );
}
