const { after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/checkout.js');

const preview = 'https://cleanpro-branch.vercel.app';
const requestId = '49c796ec-a7c5-4b31-ae37-bcf0df80683d';
const orderId = '40f7c75d-4eb1-40d3-b582-26dd13b747af';
const body = {
  requestId,
  items: [{ sku: 'plus', quantity: 2 }, { sku: 'spare-brush', quantity: 1 }],
  delivery: 'courier',
  payment: 'cod',
  coupon: 'CLEAN10',
  expectedTotalGrosz: 49510,
  recipient: { name: 'Jan Testowy', email: 'sample@example.invalid', phone: '500000000',
    street: 'Testowa 1', postalCode: '00-001', city: 'Warszawa' }
};
const env = {
  VERCEL_ENV: 'preview',
  VERCEL_BRANCH_URL: new URL(preview).host,
  VERCEL_URL: 'cleanpro-commit.vercel.app',
  DROP_STAGING_WEB_CHECKOUT: 'enabled',
  DROP_STAGING_SUPABASE_URL: 'https://testproject.supabase.co',
  DROP_STAGING_SERVICE_KEY: 'sb_secret_fake'
};
const originalFetch = global.fetch;
const previousEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
beforeEach(() => {
  Object.assign(process.env, env);
  global.fetch = async () => { throw new Error('Unexpected database request'); };
});
after(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function call(overrides = {}) {
  const headers = { origin: preview, 'content-type': 'application/json' };
  const responseHeaders = {};
  const res = {
    setHeader(name, value) { responseHeaders[name] = value; },
    status(code) { this.code = code; return this; },
    json(data) { return { status: this.code, data, headers: responseHeaders }; }
  };
  return handler({ method: 'POST', headers, body, ...overrides }, res);
}

test('accepts only configured Preview hosts and POST JSON', async () => {
  assert.equal((await call({ method: 'GET' })).headers.Allow, 'POST');
  process.env.VERCEL_ENV = 'production';
  assert.equal((await call()).status, 503);
  process.env.VERCEL_ENV = 'preview';
  delete process.env.DROP_STAGING_WEB_CHECKOUT;
  assert.equal((await call()).status, 503);
  process.env.DROP_STAGING_WEB_CHECKOUT = 'enabled';
  assert.equal((await call({ headers: { origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await call({ headers: { origin: preview } })).status, 415);
  process.env.DROP_STAGING_SUPABASE_URL = 'https://testproject.supabase.co/unexpected';
  assert.equal((await call()).status, 503);
});

test('rejects unexpected top-level fields and amounts, duplicate items, invalid options and quantities', async () => {
  const bad = [
    { email: 'test@example.invalid' },
    { payment: 'paid' },
    { delivery: 'unknown' },
    { coupon: 'OTHER' },
    { expectedTotalGrosz: -1 },
    { requestId: 'invalid' },
    { items: [] },
    { items: [body.items[0], body.items[0]] },
    { items: [{ sku: 'plus', quantity: 100 }] },
    { items: [{ sku: 'plus', quantity: 1, unitGrosz: 1 }] }
  ];
  for (const override of bad) {
    assert.equal((await call({ body: { ...body, ...override } })).status, 400, JSON.stringify(override));
  }
});

test('checks delivery data according to the selected delivery method', async () => {
  for (const override of [
    { recipient: null },
    { delivery: 'locker' },
    { recipient: { ...body.recipient, postalCode: '00001' } },
    { recipient: { ...body.recipient, phone: 'wrong' } },
    { recipient: { ...body.recipient, email: 'wrong' } },
    { recipient: { ...body.recipient, street: 'Testowa\n1' } }
  ]) {
    const result = await call({ body: { ...body, ...override } });
    assert.deepEqual(result.data, { error: 'invalid_recipient' });
  }
  const { name, email, phone } = body.recipient;
  global.fetch = async (_url, opts) => {
    assert.deepEqual(JSON.parse(opts.body).p_recipient, { name, email, phone, lockerCode: 'TEST01' });
    return Response.json({ orderId, totalGrosz: 49510 });
  };
  assert.equal((await call({ body: { ...body, delivery: 'locker',
    recipient: { name, email, phone, lockerCode: ' test01 ' } } })).status, 200);
});

test('uses the server-only RPC and returns the database receipt', async () => {
  global.fetch = async (url, opts) => {
    assert.equal(url.href, 'https://testproject.supabase.co/rest/v1/rpc/drop_create_cleanpro_test_order_with_delivery');
    assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers.apikey, env.DROP_STAGING_SERVICE_KEY);
    assert.equal(opts.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(opts.body), {
      p_request_id: requestId,
      p_items: body.items,
      p_delivery: 'courier',
      p_payment: 'cod',
      p_coupon: 'CLEAN10',
      p_expected_total_grosz: 49510,
      p_recipient: body.recipient
    });
    return Response.json({ orderId, totalGrosz: 49510 });
  };
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { orderId, totalGrosz: 49510 });
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('preserves actionable database errors and hides upstream details', async () => {
  for (const [upstream, status, error] of [
    [409, 409, 'idempotency_conflict'], [412, 412, 'price_changed'],
    [422, 422, 'items_unavailable'], [403, 502, 'database_unavailable']
  ]) {
    global.fetch = async () => Response.json({ message: 'private upstream detail' }, { status: upstream });
    const result = await call();
    assert.equal(result.status, status);
    assert.deepEqual(result.data, { error });
  }
  global.fetch = async () => Response.json({ orderId, totalGrosz: 1 });
  assert.equal((await call()).status, 502);
});
