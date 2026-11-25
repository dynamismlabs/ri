/**
 * A personal app as Ri meets one through Add app: an MCP server on this computer that is also
 * its own OAuth authorization server, like an app made with the app kit. It registers Ri
 * dynamically, consents at once on `/authorize` (the person's click), checks PKCE on `/token`, and
 * serves `/mcp` only with the token it issued. The tools and resources are the caller's.
 *
 * With `host`, it also offers the app kit's host grant (docs/personal-apps.md "Allowing Ri in an
 * app"): `/api/host/access-choices` and `/api/host/approve`, for a caller holding the app's host key,
 * with the kit's refusals. Approving mints a code for Ri's own authorization URL and says where the
 * browser would have gone.
 *
 * Real HTTP on 127.0.0.1, so Ri's own transport, OAuth client and runtime do all of their work.
 */
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';

export interface OAuthMcpApp {
  /** The address Add app takes: `http://127.0.0.1:<port>/mcp`. */
  url: string;
  origin: string;
  /** Tool calls the app received, in order. */
  calls: { name: string; args: unknown }[];
  /** Grants made through the host grant: which registered client got which access. */
  grants: { clientName: string; access: HostAccessKind }[];
  /** Every request to `/api/host/`, with its headers, so a test can see what the host sent. */
  hostRequests: { method: string; path: string; headers: Record<string, string> }[];
  /** The app's link to its hub, with `hub`: where it is, and the tokens it got. */
  hub: { url: string | null; tokens: Record<string, unknown> | null };
  close(): Promise<void>;
}

/**
 * The app kit's hub routes (kit core 0.2.11): the host tells the app where its hub is, the app
 * starts connecting and answers its authorization address, and the host sends it the code. The
 * app's OAuth client at the hub is the test's: `register` makes it for the app's callback and
 * `exchange` answers the token request the app makes with its own verifier.
 */
export interface HubHostOptions {
  /** The app uses no hub: the kit's own 404. */
  none?: boolean;
  testData?: boolean;
  purpose?: string;
  uses?: string[];
  scope?: string;
  /** The hub the app already uses. */
  url?: string;
  register(redirectUri: string): string;
  exchange(form: URLSearchParams, issuer: string): { status: number; body: Record<string, unknown> };
}

export type HostAccessKind = 'read' | 'write' | 'add';

/** The app kit's host grant, as the fixture offers it. */
export interface HostGrantOptions {
  /** The host key the app keeps in its data directory. */
  key: string;
  choices?: { access: HostAccessKind; label: string; description: string }[];
  recommended?: HostAccessKind;
  /** The app has an owner account, so the person must sign in on its own page (409). */
  signInRequired?: boolean;
  /** Where approving says to go instead of Ri's redirect URI, to test that Ri refuses it. */
  redirectTo?: (redirectUri: string, code: string, state: string) => string;
}

/** The choices People's consent screen offers, in its own words. */
export const DEFAULT_HOST_CHOICES: NonNullable<HostGrantOptions['choices']> = [
  { access: 'write', label: 'Read and make changes', description: 'Ri can read and change what it can see.' },
  { access: 'read', label: 'Read only', description: 'Ri can only read what it can see.' },
];

/** Build the app's MCP server for each request. `calls` records what Ri called. */
export type DefineApp = (server: McpServer, calls: OAuthMcpApp['calls']) => void;

export interface OAuthMcpAppOptions {
  name?: string;
  /** Answer an authorized MCP request itself, such as a broken `tools/list`. Undefined passes it on. */
  intercept?: (message: { id?: string | number; method?: string }) => Response | undefined;
  /** Offer the kit's host grant. Without it, `/api/host/` is 404, as in an app made before it. */
  host?: HostGrantOptions;
  /** Offer the kit's hub routes too (with `host`, whose key they take). Without them, as before core 0.2.11. */
  hub?: HubHostOptions;
}

export async function startOAuthMcpApp(define: DefineApp, options: OAuthMcpAppOptions = {}): Promise<OAuthMcpApp> {
  const name = options.name ?? 'fixture-app';
  const calls: OAuthMcpApp['calls'] = [];
  const grants: OAuthMcpApp['grants'] = [];
  const hostRequests: OAuthMcpApp['hostRequests'] = [];
  const clients = new Map<string, { name: string; redirectUris: string[] }>();
  const codes = new Map<string, { challenge: string; clientId: string; redirectUri: string }>();
  const tokens = new Set<string>();
  let origin = '';
  const hubLink: OAuthMcpApp['hub'] = { url: options.hub?.url ?? null, tokens: null };
  let pendingHub: { clientId: string; verifier: string; state: string; redirectUri: string } | null = null;
  const mcp = createMcpHandler(() => {
    const server = new McpServer({ name, version: '1.0.0' }, { capabilities: { tools: {}, resources: {} } });
    define(server, calls);
    return server;
  });

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp' || url.pathname === '/.well-known/oauth-protected-resource') {
      return Response.json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'] });
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return Response.json({
        issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
      });
    }
    if (url.pathname === '/register' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const clientId = `client-${randomUUID()}`;
      clients.set(clientId, { name: String(body.client_name ?? ''), redirectUris: Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [] });
      return Response.json({ ...body, client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none' }, { status: 201 });
    }
    if (url.pathname.startsWith('/api/host/')) return hostGrant(request, url);
    if (url.pathname === '/authorize') {
      // The person allows Ri on the app's consent screen.
      const code = randomUUID();
      const redirectUri = url.searchParams.get('redirect_uri')!;
      codes.set(code, { challenge: url.searchParams.get('code_challenge')!, clientId: url.searchParams.get('client_id')!, redirectUri });
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      back.searchParams.set('state', url.searchParams.get('state')!);
      back.searchParams.set('iss', origin);
      return new Response(null, { status: 302, headers: { location: back.href } });
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const form = new URLSearchParams(await request.text());
      if (form.get('grant_type') === 'authorization_code') {
        const issued = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        const verifier = form.get('code_verifier') ?? '';
        if (!issued || createHash('sha256').update(verifier).digest('base64url') !== issued.challenge || form.get('redirect_uri') !== issued.redirectUri) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
      } else if (form.get('grant_type') !== 'refresh_token') {
        return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
      }
      const accessToken = randomUUID();
      tokens.add(accessToken);
      return Response.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, refresh_token: randomUUID() });
    }
    if (url.pathname === '/mcp') {
      const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (!token || !tokens.has(token)) {
        return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` } });
      }
      if (options.intercept && request.method === 'POST') {
        const message = await request.clone().json().catch(() => ({})) as { id?: string | number; method?: string };
        const answer = options.intercept(message);
        if (answer) return answer;
      }
      return mcp.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  };

  /** The kit's host grant: the same refusals, in the same order, as the kit's own. */
  const hostGrant = async (request: Request, url: URL): Promise<Response> => {
    hostRequests.push({ method: request.method, path: url.pathname, headers: Object.fromEntries(request.headers) });
    const host = options.host;
    if (!host) return new Response('Not found', { status: 404 });
    if (request.headers.get('authorization') !== `Bearer ${host.key}`) return Response.json({ error: 'invalid_key' }, { status: 401 });
    if (['origin', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].some(name => request.headers.has(name))) {
      return Response.json({ error: 'not_from_this_computer' }, { status: 403 });
    }
    if (host.signInRequired) return Response.json({ error: 'sign_in_required' }, { status: 409 });
    if (url.pathname === '/api/host/hub' || url.pathname.startsWith('/api/host/hub/')) return hubRoutes(request, url);
    const choices = host.choices ?? DEFAULT_HOST_CHOICES;
    if (url.pathname === '/api/host/access-choices' && request.method === 'GET') return Response.json({ choices, recommended: host.recommended ?? 'write' });
    if (url.pathname !== '/api/host/approve' || request.method !== 'POST') return new Response('Not found', { status: 404 });
    const body = await request.json().catch(() => null) as { authorizationUrl?: string; access?: HostAccessKind } | null;
    let authorize: URL;
    try { authorize = new URL(body?.authorizationUrl ?? ''); } catch { return Response.json({ error: 'invalid_request' }, { status: 400 }); }
    const client = clients.get(authorize.searchParams.get('client_id') ?? '');
    const redirectUri = authorize.searchParams.get('redirect_uri') ?? '';
    if (`${authorize.origin}${authorize.pathname}` !== `${origin}/authorize` || !client || !client.redirectUris.includes(redirectUri)
      || authorize.searchParams.get('code_challenge_method') !== 'S256' || !authorize.searchParams.get('code_challenge') || !authorize.searchParams.get('state')) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    if (!choices.some(choice => choice.access === body?.access)) return Response.json({ error: 'invalid_choice' }, { status: 400 });
    const code = randomUUID();
    const state = authorize.searchParams.get('state')!;
    codes.set(code, { challenge: authorize.searchParams.get('code_challenge')!, clientId: authorize.searchParams.get('client_id')!, redirectUri });
    grants.push({ clientName: client.name, access: body!.access! });
    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    back.searchParams.set('state', state);
    back.searchParams.set('iss', origin);
    return Response.json({ redirectTo: host.redirectTo ? host.redirectTo(redirectUri, code, state) : back.href });
  };

  /** The kit's hub routes, after the host grant's refusals. */
  const hubRoutes = async (request: Request, url: URL): Promise<Response> => {
    const hub = options.hub;
    // An app made before them: a POST it doesn't know is 404, and a GET gets its page.
    if (!hub) return request.method === 'GET' ? new Response('<!doctype html><title>app</title>', { headers: { 'content-type': 'text/html' } }) : new Response('Not found', { status: 404 });
    if (hub.none) return Response.json({ error: 'not_found', message: 'This app doesn\'t use your accounts through a hub.' }, { status: 404 });
    const answer = () => Response.json({
      source: hub.testData ? 'fixtures' : 'hub', state: hubLink.tokens ? 'connected' : 'not_connected', url: hubLink.url, error: null,
      purpose: hub.purpose ?? null, uses: hub.uses ?? [], scope: hub.scope ?? null,
    });
    if (url.pathname === '/api/host/hub' && request.method === 'GET') return answer();
    const body = await request.json().catch(() => ({})) as { url?: unknown; code?: unknown; state?: unknown };
    const loopback = (value: unknown) => {
      try { const parsed = new URL(String(value)); return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ? parsed.href : null; }
      catch { return null; }
    };
    if (url.pathname === '/api/host/hub' && request.method === 'POST') {
      const offered = loopback(body.url);
      if (!offered) return Response.json({ error: 'invalid_request' }, { status: 400 });
      hubLink.url ??= offered;
      return answer();
    }
    if (url.pathname === '/api/host/hub/connect' && request.method === 'POST') {
      const target = loopback(body.url);
      if (!target) return Response.json({ error: 'invalid_request' }, { status: 400 });
      hubLink.url = target;
      hubLink.tokens = null;
      const redirectUri = `${origin}/api/hub/callback`;
      const verifier = `${randomUUID()}${randomUUID()}`;
      pendingHub = { clientId: hub.register(redirectUri), verifier, state: randomUUID(), redirectUri };
      const authorize = new URL('/oauth/authorize', target);
      authorize.search = new URLSearchParams({
        response_type: 'code', client_id: pendingHub.clientId, redirect_uri: redirectUri, state: pendingHub.state, resource: target,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...(hub.scope ? { scope: hub.scope } : {}),
      }).toString();
      return Response.json({ authorizationUrl: authorize.href });
    }
    if (url.pathname === '/api/host/hub/finish' && request.method === 'POST') {
      const pending = pendingHub;
      if (!pending || body.state !== pending.state || typeof body.code !== 'string') {
        return Response.json({ error: 'invalid_grant', message: 'This approval doesn\'t match a connection this app started.' }, { status: 400 });
      }
      const reply = hub.exchange(new URLSearchParams({
        grant_type: 'authorization_code', code: body.code, redirect_uri: pending.redirectUri, client_id: pending.clientId, code_verifier: pending.verifier,
      }), new URL(hubLink.url!).origin);
      if (reply.status !== 200) return Response.json({ error: 'invalid_grant', message: String(reply.body.error_description ?? reply.body.error) }, { status: 400 });
      hubLink.tokens = reply.body;
      pendingHub = null;
      return answer();
    }
    return new Response('Not found', { status: 404 });
  };

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
    const response = await handle(new Request(`${origin}${req.url}`, { method: req.method, headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) return res.end();
    const reader = response.body.getReader();
    for (;;) { const part = await reader.read(); if (part.done) break; res.write(part.value); }
    res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url: `${origin}/mcp`, origin, calls, grants, hostRequests, hub: hubLink,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
