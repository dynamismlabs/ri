/**
 * A personal app as Ri meets one through Add app: an MCP server on this computer that is also
 * its own OAuth authorization server, like an app made with the app kit. It registers Ri
 * dynamically, consents at once on `/authorize` (the person's click), checks PKCE on `/token`, and
 * serves `/mcp` only with the token it issued. The tools and resources are the caller's.
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
  close(): Promise<void>;
}

/** Build the app's MCP server for each request. `calls` records what Ri called. */
export type DefineApp = (server: McpServer, calls: OAuthMcpApp['calls']) => void;

export interface OAuthMcpAppOptions {
  name?: string;
  /** Answer an authorized MCP request itself, such as a broken `tools/list`. Undefined passes it on. */
  intercept?: (message: { id?: string | number; method?: string }) => Response | undefined;
}

export async function startOAuthMcpApp(define: DefineApp, options: OAuthMcpAppOptions = {}): Promise<OAuthMcpApp> {
  const name = options.name ?? 'fixture-app';
  const calls: OAuthMcpApp['calls'] = [];
  const codes = new Map<string, { challenge: string; clientId: string; redirectUri: string }>();
  const tokens = new Set<string>();
  let origin = '';
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
      return Response.json({ ...body, client_id: `client-${randomUUID()}`, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none' }, { status: 201 });
    }
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
    url: `${origin}/mcp`, origin, calls,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
