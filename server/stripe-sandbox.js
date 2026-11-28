const { createHmac, timingSafeEqual } = require('node:crypto');

const orderIdPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const marker = 'cleanpro-preview';
const sandboxEnabled = () => process.env.VERCEL_ENV === 'preview' &&
  process.env.DROP_STAGING_WEB_CHECKOUT === 'enabled' && process.env.DROP_STRIPE_SANDBOX === 'enabled' &&
  /^(?:sk|rk)_test_[a-zA-Z0-9_]+$/.test(process.env.DROP_STRIPE_SECRET_KEY ?? '') &&
  /^whsec_[a-zA-Z0-9_]+$/.test(process.env.DROP_STRIPE_WEBHOOK_SECRET ?? '');

async function databaseRpc(name, args) {
  const key = process.env.DROP_STAGING_SERVICE_KEY;
  const database = process.env.DROP_STAGING_SUPABASE_URL ?? '';
  if (!key || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(database)) throw Error('Database setup');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(new URL('/rest/v1/rpc/' + name, database), {
    method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(7000), redirect: 'error'
  });
  if (!r.ok) throw Error('Payment state unavailable');
  return r.status === 204 ? null : r.json();
}

async function stripe(path, options = {}) {
  const response = await fetch('https://api.stripe.com/v1/' + path, {
    ...options,
    headers: { ...options.headers, Authorization: 'Bearer ' + process.env.DROP_STRIPE_SECRET_KEY },
    redirect: 'error',
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw Error('Stripe sandbox unavailable');
  const object = await response.json();
  if (object.livemode !== false) throw Error('Expected Stripe test object');
  return object;
}

async function startSandboxPayment(orderId, totalGrosz, origin) {
  if (!await databaseRpc('drop_begin_stripe_test', { p_order_id: orderId })) return null;
  const form = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'pln',
    'line_items[0][price_data][product_data][name]': 'Zamówienie testowe CleanPro',
    'line_items[0][price_data][unit_amount]': String(totalGrosz),
    'line_items[0][quantity]': '1',
    'metadata[order_id]': orderId,
    'metadata[integration]': marker,
    'payment_intent_data[metadata][order_id]': orderId,
    'payment_intent_data[metadata][integration]': marker,
    success_url: origin + '/platnosc-testowa.html?wynik=powrot',
    cancel_url: origin + '/platnosc-testowa.html?wynik=anulowano'
  });
  const session = await stripe('checkout/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': 'cleanpro-preview-' + orderId },
    body: form
  });
  if (session.status !== 'open' || session.amount_total !== totalGrosz || session.currency !== 'pln') {
    throw Error('Unexpected Stripe session');
  }
  const url = new URL(session.url);
  if (url.origin !== 'https://checkout.stripe.com') throw Error('Unexpected Stripe Checkout origin');
  return url.href;
}

function verifyStripeEvent(raw, header, secret, now = Date.now()) {
  if (typeof header !== 'string') return null;
  const fields = header.split(',').map(pair => pair.trim().split('='));
  const timestamps = fields.filter(([key]) => key === 't');
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1] ?? '')) return null;
  const timestamp = Number(timestamps[0][1]);
  if (Math.abs(Math.floor(now / 1000) - timestamp) > 300) return null;
  const expected = createHmac('sha256', secret).update(timestamps[0][1] + '.').update(raw).digest();
  if (!fields.some(([key, value]) => key === 'v1' && /^[a-f0-9]{64}$/i.test(value ?? '') &&
      timingSafeEqual(expected, Buffer.from(value, 'hex')))) return null;
  try { return JSON.parse(raw.toString('utf8')); } catch { return null; }
}

async function applyStripeEvent(event) {
  const object = event.data?.object;
  if (event.livemode !== false || object?.livemode !== false || !/^evt_[a-zA-Z0-9]+$/.test(event.id ?? '')) return;
  let status, amount, currency, intent, metadata = object.metadata;
  if (event.type === 'payment_intent.succeeded' && object.status === 'succeeded') {
    status = 'paid';
    ({ amount_received: amount, currency, id: intent } = object);
  } else if (event.type === 'checkout.session.expired' && object.status === 'expired' && object.payment_status === 'unpaid') {
    status = 'failed';
    ({ amount_total: amount, currency } = object);
    intent = null;
  } else if (event.type === 'charge.refunded' && object.refunded === true &&
    object.amount_refunded === object.amount && /^pi_[a-zA-Z0-9]+$/.test(object.payment_intent ?? '')) {
    const payment = await stripe('payment_intents/' + object.payment_intent);
    if (payment.amount_received !== object.amount_refunded || payment.currency !== object.currency) return;
    status = 'refunded';
    ({ amount_refunded: amount, currency, payment_intent: intent } = object);
    metadata = payment.metadata;
  } else return;

  if (metadata?.integration !== marker || !orderIdPattern.test(metadata.order_id ?? '') ||
    !Number.isSafeInteger(amount) || amount < 1 || currency !== 'pln' ||
    (status !== 'failed' && !/^pi_[a-zA-Z0-9]+$/.test(intent ?? ''))) return;

  await databaseRpc('drop_apply_stripe_test_event', {
    p_order_id: metadata.order_id, p_event_id: event.id, p_status: status,
    p_amount: amount, p_currency: currency, p_intent: intent
  });
}

module.exports = { sandboxEnabled, startSandboxPayment, verifyStripeEvent, applyStripeEvent };
