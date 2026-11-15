// Devnet RPC resilience (mocked fetch, deterministic): bounded retries with backoff for reads, Retry-After honoured,
// non-retryable errors fail fast, identical reads share one request, and a transaction is NEVER sent twice.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const S = await server.ssrLoadModule('/supabase/functions/_shared/solana.ts');
const D = await server.ssrLoadModule('/src/lib/clubfund/devnet.ts');

const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const ok = (result) => reply(200, { jsonrpc: '2.0', id: 1, result });
function scripted(steps) {
  const calls = [];
  const fn = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.method);
    const step = typeof steps === 'function' ? steps(body, calls.length) : steps.shift();
    if (step instanceof Error) throw step;
    return step;
  };
  return { fn, calls };
}

test('server reads: HTTP 429 is retried after Retry-After (capped), then succeeds', async () => {
  const f = scripted([reply(429, 'slow down', { 'retry-after': '1' }), reply(429, 'slow down', { 'retry-after': '30' }), ok('hash')]);
  const sleeps = [];
  const r = await S.rpcRead(f.fn, 'https://devnet.test', 'getGenesisHash', [], { sleep: async (ms) => sleeps.push(ms), random: () => 0 });
  assert.equal(r, 'hash');
  assert.deepEqual(f.calls, ['getGenesisHash', 'getGenesisHash', 'getGenesisHash']);
  assert.deepEqual(sleeps, [1000, 2000], 'Retry-After honoured, capped at 2 s');
});

test('server reads: network errors and 5xx back off exponentially; give up after the attempt limit', async () => {
  const sleeps = [];
  const f = scripted([new TypeError('fetch failed'), reply(503, 'down'), reply(502, 'down')]);
  await assert.rejects(S.rpcRead(f.fn, 'u', 'getTransaction', ['sig'], { sleep: async (ms) => sleeps.push(ms), random: () => 0 }), (e) => e instanceof S.RpcError && e.retryable);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(sleeps, [300, 600]);
  const g = scripted([reply(200, { jsonrpc: '2.0', id: 1, error: { code: -32429, message: 'rate limited' } }), ok({ value: [null] })]);
  assert.deepEqual(await S.rpcRead(g.fn, 'u', 'getSignatureStatuses', [[]], { sleep: async () => {} }), { value: [null] }, 'JSON-RPC rate-limit errors are retried');
});

test('server reads: invalid requests are not retried', async () => {
  const f = scripted([reply(200, { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid param: WrongSize' } })]);
  await assert.rejects(S.rpcRead(f.fn, 'u', 'getTransaction', ['bad'], { sleep: async () => {} }), (e) => e instanceof S.RpcError && !e.retryable && /WrongSize/.test(e.message));
  assert.equal(f.calls.length, 1);
  const g = scripted([reply(400, 'bad request')]);
  await assert.rejects(S.rpcRead(g.fn, 'u', 'getTransaction', ['bad'], { sleep: async () => {} }), (e) => !e.retryable);
  assert.equal(g.calls.length, 1);
});

const DEVNET = S.DEVNET_GENESIS_HASH;
const withFetch = async (handler, fn) => {
  const original = globalThis.fetch;
  const f = scripted(handler);
  globalThis.fetch = f.fn;
  try {
    return await fn(f.calls);
  } finally {
    globalThis.fetch = original;
  }
};

test('browser: a non-Devnet endpoint is refused before anything else', async () => {
  await withFetch(
    (b) => ok(b.method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : null),
    async (calls) => {
      await assert.rejects(D.getBalance('addr'), (e) => e.code === 'wrong_network');
      assert.deepEqual(calls, ['getGenesisHash'], 'no balance request against a Mainnet endpoint');
    },
  );
});

test('browser: rate-limited reads are retried; identical concurrent reads share one request', async () => {
  let balanceCalls = 0;
  await withFetch(
    (b) => {
      if (b.method === 'getGenesisHash') return ok(DEVNET);
      if (b.method === 'getBalance' && ++balanceCalls === 1) return reply(429, 'busy', { 'retry-after': '0.05' });
      return ok({ context: { slot: 1 }, value: 1_500_000_000 });
    },
    async (calls) => {
      const [a, b] = await Promise.all([D.getBalance('W1'), D.getBalance('W1')]);
      assert.deepEqual([a, b], [1_500_000_000, 1_500_000_000]);
      assert.equal(calls.filter((m) => m === 'getBalance').length, 2, 'one shared request, retried once after 429');
    },
  );
});

test('browser: a transaction is submitted once; uncertain results are never re-sent', async () => {
  const tx = new Uint8Array(200).fill(1);
  for (const failure of [new TypeError('network down'), reply(429, 'busy'), reply(503, 'down')]) {
    await withFetch(
      (b) => (b.method === 'getGenesisHash' ? ok(DEVNET) : failure instanceof Error ? (() => { throw failure; })() : failure.clone()),
      async (calls) => {
        await assert.rejects(D.sendSignedTransaction(tx), (e) => e.code === 'uncertain' && /don't send it again/.test(e.message));
        assert.equal(calls.filter((m) => m === 'sendTransaction').length, 1, 'exactly one submission');
      },
    );
  }
  await withFetch(
    (b) => (b.method === 'getGenesisHash' ? ok(DEVNET) : reply(200, { jsonrpc: '2.0', id: 1, error: { code: -32002, message: 'Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.' } })),
    async (calls) => {
      await assert.rejects(D.sendSignedTransaction(tx), (e) => e.code === 'rejected' && /Not enough Devnet SOL/.test(e.message));
      assert.equal(calls.filter((m) => m === 'sendTransaction').length, 1);
    },
  );
});

test('browser: confirmation polling backs off while Devnet errors and reports unknown, never "failed"', async () => {
  const sleeps = [];
  await withFetch(
    () => reply(503, 'down'),
    async () => {
      const r = await D.waitForConfirmation('sig', 100, { intervalMs: 10, timeoutMs: 60_000, sleep: async (ms) => sleeps.push(ms) });
      assert.equal(r, 'unknown');
    },
  );
  assert.ok(sleeps.length >= 5 && sleeps[1] > sleeps[0], `increasing waits: ${sleeps.join(',')}`);
});
