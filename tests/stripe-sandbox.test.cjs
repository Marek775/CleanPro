const { test, after } = require('node:test');
const { Readable } = require('node:stream');
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const { sandboxEnabled, startSandboxPayment } = require('../server/stripe-sandbox');
const webhook = require('../api/stripe-webhook');

const testEnv = {
  VERCEL_ENV: 'preview', DROP_STAGING_WEB_CHECKOUT: 'enabled', DROP_STRIPE_SANDBOX: 'enabled',
  DROP_STRIPE_SECRET_KEY: 'sk_test_fake', DROP_STRIPE_WEBHOOK_SECRET: 'whsec_fake',
  DROP_STAGING_SERVICE_KEY: 'sb_secret_fake', DROP_STAGING_SUPABASE_URL: 'https://testproject.supabase.co'
};
const priorEnv = Object.fromEntries(Object.keys(testEnv).map(key => [key, process.env[key]]));
Object.assign(process.env, testEnv);
const originalFetch = global.fetch;
after(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const id = '49c796ec-a7c5-4b31-ae37-bcf0df80683d';
const metadata = { order_id: id, integration: 'cleanpro-preview' };
const paid = { id: 'evt_test1', type: 'payment_intent.succeeded', livemode: false, data: {
  object: { livemode: false, id: 'pi_test1', status: 'succeeded', amount_received: 24900, currency: 'pln', metadata }
} };
function post(event, secret = 'whsec_fake', offset = 0) {
  const raw = Buffer.from(JSON.stringify(event));
  const time = Math.floor(Date.now() / 1000) + offset;
  const signature = createHmac('sha256', secret).update(time + '.').update(raw).digest('hex');
  const req = Object.assign(Readable.from([raw]), {
    method: 'POST', headers: { 'stripe-signature': 't=' + time + ',v1=' + signature }
  });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { return { code: this.code, data }; } };
  return webhook(req, res);
}

test('keeps sandbox routes disabled with live keys or on Production', async () => {
  assert.equal(sandboxEnabled(), true);
  process.env.DROP_STRIPE_SECRET_KEY = 'sk_live_fake';
  assert.equal((await post(paid)).code, 503);
  process.env.DROP_STRIPE_SECRET_KEY = testEnv.DROP_STRIPE_SECRET_KEY;
  process.env.VERCEL_ENV = 'production';
  assert.equal((await post(paid)).code, 503);
  process.env.VERCEL_ENV = 'preview';
});

test('creates idempotent card sessions in PLN without passing recipient data', async () => {
  global.fetch = async (url, opts) => {
    if (String(url).includes('drop_begin_stripe_test')) {
      assert.deepEqual(JSON.parse(opts.body), { p_order_id: id });
      return Response.json(true);
    }
    assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(opts.headers['Idempotency-Key'], 'cleanpro-preview-' + id);
    assert.equal(opts.body.get('line_items[0][price_data][unit_amount]'), '24900');
    assert.equal(opts.body.get('payment_intent_data[metadata][order_id]'), id);
    assert.equal(opts.body.get('customer_email'), null);
    return Response.json({ livemode: false, status: 'open', amount_total: 24900, currency: 'pln',
      url: 'https://checkout.stripe.com/c/pay/cs_test_demo' });
  };
  assert.equal(await startSandboxPayment(id, 24900, 'https://preview.example.invalid'),
    'https://checkout.stripe.com/c/pay/cs_test_demo');
});

test('rejects invalid and stale signatures and live-mode events', async () => {
  global.fetch = async () => assert.fail('unexpected database call');
  assert.equal((await post(paid, 'wrong')).code, 400);
  assert.equal((await post(paid, 'whsec_fake', -301)).code, 400);
  assert.equal((await post({ ...paid, livemode: true })).code, 400);
});

test('dispatches verified success, expiry and full refund events to the database', async () => {
  const notices = [];
  global.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.stripe.com')) {
      return Response.json({ livemode: false, metadata, amount_received: 24900, currency: 'pln' });
    }
    assert.match(String(url), /rpc\/drop_apply_stripe_test_event$/);
    notices.push(JSON.parse(opts.body));
    return new Response(null, { status: 204 });
  };
  const expired = { ...paid, id: 'evt_expired', type: 'checkout.session.expired',
    data: { object: { livemode: false, status: 'expired', payment_status: 'unpaid', amount_total: 24900, currency: 'pln', metadata } } };
  const refund = { ...paid, id: 'evt_refund', type: 'charge.refunded',
    data: { object: { livemode: false, refunded: true, amount: 24900, amount_refunded: 24900,
      currency: 'pln', payment_intent: 'pi_test1' } } };
  for (const event of [paid, expired, refund, { ...refund, data: { object: { ...refund.data.object, amount_refunded: 100 } } }]) {
    assert.equal((await post(event)).code, 200);
  }
  assert.deepEqual(notices.map(n => [n.p_status, n.p_amount, n.p_order_id, n.p_intent]),
    [['paid', 24900, id, 'pi_test1'], ['failed', 24900, id, null], ['refunded', 24900, id, 'pi_test1']]);
});
