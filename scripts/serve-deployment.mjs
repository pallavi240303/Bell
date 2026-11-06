// Single-container server for the BELL Arc Testnet deployment.
//
//   /            built frontend assets only (dist/), no source files, dotfiles or runtime state
//   /api/*       the existing read-only keeper API (state, manifest, events, health) and unsigned /prepare
//   /rpc         fixed-target, read-only JSON-RPC proxy to Arc Testnet (no signing, sending or admin methods)
//   /healthz     process readiness and index progress (no chain state)
//
// Run:  node --import tsx scripts/serve-deployment.mjs     (PORT defaults to 3000)
//
// Nothing here seeds a cursor, changes the deployment block or skips event discovery: the keeper's own
// Store/Indexer/indexedState run unchanged, and startup performs the keeper's full deployment verification
// (chain id, runtime code hashes, reciprocal bindings, immutable profile) before /api and /rpc answer.
import {createServer} from 'node:http';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {clientFor, verifyDeployment} from '../services/keeper/config.ts';
import {Store} from '../services/keeper/store.ts';
import {Indexer} from '../services/keeper/indexer.ts';
import {indexedState, indexedEvents} from '../services/keeper/state.ts';
import {createApi} from '../services/keeper/api.ts';
import {prepareActor} from '../services/keeper/transactions.ts';
import {json} from '../services/keeper/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The only upstream this server will ever contact. It is a constant, not configuration. */
export const UPSTREAM_RPC = 'https://rpc.testnet.arc.io';
export const EXPECTED_CHAIN_ID = '5042002';
export const DEPLOYMENT_PATH = join(ROOT, 'deployments', 'arc-optional-cover.json');
/** Read-only JSON-RPC methods the frontend needs. Everything else (send*, sign*, personal_*, wallet_*, debug_*, admin_*, ...) is rejected. */
export const RPC_METHODS = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getCode',
  'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance',
  'eth_getTransactionCount', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getStorageAt',
]);
const MAX_BODY = 64 * 1024, MAX_BATCH = 8, REQUEST_TIMEOUT_MS = 240_000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
};
const BASE_HEADERS = {'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin'};
const API_ROUTES = new Set(['GET /state', 'GET /manifest', 'GET /events', 'GET /health', 'POST /prepare']);

function reply(res, status, body, type = 'application/json', headers = {}) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {...BASE_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store', ...headers});
  res.end(body);
}
const fail = (res, status, message, headers) => reply(res, status, JSON.stringify({error: message}), 'application/json', headers);

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {size += chunk.length; if (size > MAX_BODY) throw Object.assign(Error('request too large'), {status: 413}); chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
/** A browser POST always names its origin. Refuse any POST whose origin is not this host. */
function sameOriginPost(req) {
  const origin = req.headers.origin; if (origin === undefined) return true;
  let host; try {host = new URL(origin).host;} catch {return false;}
  const forwarded = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim();
  return host === req.headers.host || (forwarded !== '' && host === forwarded);
}
function rpcError(id, code, message) {return {jsonrpc: '2.0', id: id ?? null, error: {code, message}};}
function cleanMessage(error) {
  const text = String(error?.shortMessage ?? error?.message ?? 'upstream request failed');
  return text.split('\n').filter(line => !/^\s*(URL|Request body|Details|Version):/i.test(line))[0].slice(0, 300) || 'upstream request failed';
}
/** Forwards allowed read-only calls through the paced client. Cookies, authorization and arbitrary URLs never reach the upstream. */
async function rpcOne(client, item, signal) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return rpcError(null, -32600, 'invalid request');
  const {id} = item;
  if (item.jsonrpc !== '2.0' || Object.keys(item).some(key => !['jsonrpc','id','method','params'].includes(key))) return rpcError(id, -32600, 'invalid request');
  if (!(id === null || Number.isSafeInteger(id) || typeof id === 'string' && id.length <= 256)) return rpcError(null, -32600, 'invalid request id');
  if (typeof item.method !== 'string') return rpcError(id, -32600, 'invalid request');
  if (!RPC_METHODS.has(item.method)) return rpcError(id, -32601, `method not allowed: ${item.method.slice(0, 64)}`);
  const params = item.params === undefined ? [] : item.params;
  if (!Array.isArray(params)) return rpcError(id, -32602, 'invalid params');
  try {return {jsonrpc: '2.0', id, result: await client.request({method: item.method, params}, {signal, retryCount: 0})};}
  catch (error) {
    let cause=error;while(cause?.cause && !Number.isInteger(cause.code))cause=cause.cause;
    const response=rpcError(id, Number.isInteger(cause?.code) ? cause.code : -32000, cleanMessage(cause));
    if(cause?.data !== undefined)response.error.data=cause.data;
    return response;
  }
}
async function rpcRoute(req, res, client, signal) {
  if (req.method !== 'POST') return fail(res, 405, 'POST required', {Allow: 'POST'});
  if (!sameOriginPost(req)) return fail(res, 403, 'cross-origin request refused');
  let payload; try {payload = JSON.parse(await readBody(req));} catch (error) {return fail(res, error?.status ?? 400, error?.status === 413 ? 'request too large' : 'invalid JSON');}
  if (Array.isArray(payload)) {
    if (payload.length === 0 || payload.length > MAX_BATCH) return fail(res, 400, 'batch size must be 1 to 8');
    return reply(res, 200, JSON.stringify(await Promise.all(payload.map(item => rpcOne(client, item, signal)))));
  }
  return reply(res, 200, JSON.stringify(await rpcOne(client, payload, signal)));
}

/** Resolves a request path to a regular file inside the built frontend, or null. Dotfiles, traversal and symlinks never resolve. */
export function resolveAsset(distRoot, pathname) {
  let path; try {path = decodeURIComponent(pathname);} catch {return null;}
  if (path.includes('\0') || path.includes('\\')) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.some(segment => segment === '..' || segment.startsWith('.'))) return null;
  const full = resolve(distRoot, ...(segments.length ? segments : ['index.html']));
  if (!full.startsWith(distRoot + sep)) return null;
  try {
    const info = lstatSync(full);
    if (!info.isFile() || info.isSymbolicLink() || !TYPES[extname(full).toLowerCase()]) return null;
    const canonical=realpathSync(full);
    return canonical.startsWith(distRoot + sep) ? canonical : null;
  } catch {return null;}
}
function staticRoute(req, res, distRoot, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'GET required', {Allow: 'GET, HEAD'});
  let file = resolveAsset(distRoot, pathname);
  // Extensionless client routes fall back to the built shell; anything that names a file stays a 404.
  if (!file && /^\/[\w\-/]*$/.test(pathname)) file = resolveAsset(distRoot, '/index.html');
  if (!file) return fail(res, 404, 'not found');
  const body = readFileSync(file), immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {...BASE_HEADERS, 'Content-Type': TYPES[extname(file).toLowerCase()], 'Content-Length': body.length, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'});
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * Builds the server. `client` is the one paced RPC client shared by deployment verification, the keeper index and the /rpc proxy,
 * so every read counts against the same request budget. Production passes `clientFor(UPSTREAM_RPC)`.
 */
export function createDeploymentServer({deployment, client, indexPath, distDir, requestTimeoutMs=REQUEST_TIMEOUT_MS, startupTimeoutMs=REQUEST_TIMEOUT_MS}) {
  const distRoot = realpathSync(distDir);
  const status = {phase: 'starting', error: undefined};
  let api, store;
  const startup = (async () => {
    // Same startup order as the keeper CLI: verify the deployment on the live chain, then open the single-writer store.
    await verifyDeployment(client, deployment);
    if (status.phase === 'failed') throw Error('startup timeout');
    store = new Store(indexPath, deployment);
    const index = new Indexer(store, client, async (_block, logs) => ({discoveryOnly: true, logCount: logs.length}), deployment.chainId === EXPECTED_CHAIN_ID ? {discovery:'finalized'} : undefined);
    status.phase = 'indexing';
    await index.sync();
    const pending = new Map();
    const refresh = (watch = []) => {
      const normalized = [...new Set(watch.map(address => address.toLowerCase()))].sort(), key = normalized.join(',');
      let frame = pending.get(key);
      if (!frame) {frame = indexedState(index, client, normalized).finally(() => {pending.delete(key);}); pending.set(key, frame);}
      return frame;
    };
    api = createApi({manifest: () => deployment, state: refresh, events: boundary => indexedEvents(index, client, boundary),
      prepare: async input => {const current = await refresh(); return prepareActor(deployment, current.block, input, client);}});
    if (status.phase !== 'failed') status.phase = 'ready';
  })();
  let startupTimer;
  const ready=Promise.race([startup,new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(Error('startup timeout')),startupTimeoutMs);})]).finally(()=>clearTimeout(startupTimer));
  ready.catch(error => {status.phase = 'failed'; status.error = cleanMessage(error);});
  const server = createServer(async (req, res) => {
    const abort = new AbortController();
    const timer = setTimeout(() => {abort.abort();if (!res.headersSent) fail(res,status.phase === 'ready'?504:503,'request timeout; refresh required');else res.destroy();},requestTimeoutMs);
    res.on('error',()=>{});
    res.once('finish',()=>clearTimeout(timer));res.once('close',()=>{clearTimeout(timer);abort.abort();});
    try {
      const url = new URL(req.url ?? '/', 'http://localhost'), pathname = url.pathname;
      if (pathname === '/healthz') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'GET required', {Allow: 'GET, HEAD'});
        return reply(res, status.phase === 'ready' ? 200 : 503, json({
          status: status.phase, error: status.error, deploymentBlock: deployment.deploymentBlock,
          indexedBlocks: store?.data.blocks.length ?? 0, cursorBlock: store?.data.cursor?.blockNumber ?? null,
        }));
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const route = pathname.slice(4) || '/';
        if (!API_ROUTES.has(`${req.method} ${route}`)) return fail(res, 404, 'route unavailable');
        try {await ready;} catch {return fail(res,503,'deployment startup unavailable; refresh required',{'Retry-After':'5'});}
        if (res.writableEnded || res.destroyed) return;
        if (req.method === 'POST' && !sameOriginPost(req)) return fail(res, 403, 'cross-origin request refused');
        req.url = route + url.search; // the keeper routes match on the unprefixed path
        return api.emit('request', req, res);
      }
      if (pathname === '/rpc') {
        try {await ready;} catch {return fail(res,503,'deployment startup unavailable; refresh required',{'Retry-After':'5'});}
        if (res.writableEnded || res.destroyed) return;
        if (url.search) return fail(res,400,'RPC target overrides unavailable');
        return await rpcRoute(req, res, client, abort.signal);
      }
      return staticRoute(req, res, distRoot, pathname);
    } catch (error) {
      if (!res.headersSent) fail(res, 500, 'internal error'); else res.end();
    }
  });
  server.requestTimeout=REQUEST_TIMEOUT_MS;server.headersTimeout=30_000;server.timeout=REQUEST_TIMEOUT_MS;
  return {server, ready, status, get store() {return store;}};
}

function loadDeployment() {
  const deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8'));
  if (deployment.chainId !== EXPECTED_CHAIN_ID) throw Error(`deployment chain must be ${EXPECTED_CHAIN_ID}`);
  return deployment;
}
async function main() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be an integer from 1 to 65535');
  const app = createDeploymentServer({
    deployment: loadDeployment(), client: clientFor(UPSTREAM_RPC),
    indexPath: process.env.BELL_INDEX_PATH ?? '/tmp/bell-keeper/index.json', distDir: join(ROOT, 'dist'),
  });
  app.server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({listening: port, phase: app.status.phase})));
  app.ready.then(() => console.log(JSON.stringify({phase: 'ready'})), error => {console.error(`startup verification failed: ${cleanMessage(error)}`); process.exit(1);});
  const stop = () => {app.server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 25_000).unref();};
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
