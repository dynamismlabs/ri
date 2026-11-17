/**
 * A tiny app for Ri's install and remove tests, run by the kit stand-in (kit/cli.mjs) as its
 * service. It's its own OAuth server, as an app made with the kit is (dynamic registration, PKCE,
 * consent that allows at once), and serves MCP over plain JSON-RPC. Its one tool counts visits in
 * a file in its data directory, so a test can tell its data survived being uninstalled.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const port = Number(process.env.PORT);
const dataDir = process.env.APP_DATA_DIR;
const origin = `http://127.0.0.1:${port}`;
const visitsFile = path.join(dataDir, 'visits.json');
const codes = new Map();
const tokens = new Set();

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const visits = () => (fs.existsSync(visitsFile) ? JSON.parse(fs.readFileSync(visitsFile, 'utf8')).visits : 0);

function rpc(message) {
  const reply = (result) => ({ jsonrpc: '2.0', id: message.id, result });
  switch (message.method) {
    case 'initialize':
      return reply({ protocolVersion: message.params?.protocolVersion ?? '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'tide-log', version: '1.0.0' } });
    case 'tools/list':
      return reply({ tools: [{ name: 'visits', description: 'Count a visit and say how many there have been.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } }] });
    case 'tools/call': {
      if (message.params?.name !== 'visits') return { jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'No such tool' } };
      const count = visits() + 1;
      fs.writeFileSync(visitsFile, JSON.stringify({ visits: count }));
      return reply({ content: [{ type: 'text', text: String(count) }], structuredContent: { visits: count } });
    }
    default:
      return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
  }
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  const url = new URL(req.url, origin);
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json(res, 200, { resource: `${origin}/mcp`, authorization_servers: [origin] });
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    return json(res, 200, {
      issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], authorization_response_iss_parameter_supported: true,
    });
  }
  if (url.pathname === '/register' && req.method === 'POST') return json(res, 201, { ...JSON.parse(body), client_id: `client-${randomUUID()}`, token_endpoint_auth_method: 'none' });
  if (url.pathname === '/authorize') {
    const code = randomUUID();
    codes.set(code, { challenge: url.searchParams.get('code_challenge'), redirectUri: url.searchParams.get('redirect_uri') });
    const back = new URL(url.searchParams.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', url.searchParams.get('state'));
    back.searchParams.set('iss', origin);
    res.writeHead(302, { location: back.href });
    return res.end();
  }
  if (url.pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(body);
    if (form.get('grant_type') === 'authorization_code') {
      const issued = codes.get(form.get('code'));
      codes.delete(form.get('code'));
      if (!issued || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== issued.challenge) return json(res, 400, { error: 'invalid_grant' });
    }
    const token = randomUUID();
    tokens.add(token);
    return json(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 3600, refresh_token: randomUUID() });
  }
  if (url.pathname === '/mcp') {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !tokens.has(token)) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` });
      return res.end();
    }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const message = JSON.parse(body);
    if (message.id === undefined) { res.writeHead(202); return res.end(); }
    return json(res, 200, rpc(message));
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
