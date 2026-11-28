const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const skus = new Set(['basic', 'plus', 'premium', 'spare-brush', 'heavy-brush', 'extra-heads']);

function validCheckout(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 7 || typeof body.requestId !== 'string' || !UUID_V4.test(body.requestId) ||
      !['locker', 'courier'].includes(body.delivery) ||
      !['blik', 'transfer', 'card', 'cod'].includes(body.payment) ||
      ![null, 'CLEAN10'].includes(body.coupon) ||
      !Number.isSafeInteger(body.expectedTotalGrosz) || body.expectedTotalGrosz < 0 ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > skus.size) return false;

  const seen = new Set();
  return body.items.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 2 ||
        !skus.has(item.sku) || seen.has(item.sku) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return false;
    seen.add(item.sku);
    return true;
  });
}

function normalizeRecipient(input, delivery) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const limits = { name: 100, email: 254, phone: 24, ...(delivery === 'locker'
    ? { lockerCode: 24 } : { street: 140, postalCode: 6, city: 100 }) };
  if (Object.keys(input).length !== Object.keys(limits).length) return null;

  const recipient = {};
  for (const [field, limit] of Object.entries(limits)) {
    const value = input[field];
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > limit) return null;
    recipient[field] = trimmed;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) ||
      !/^\+?[0-9][0-9 ()-]{6,22}$/.test(recipient.phone)) return null;
  if (delivery === 'locker') {
    recipient.lockerCode = recipient.lockerCode.toUpperCase();
    if (!/^[A-Z0-9-]{3,24}$/.test(recipient.lockerCode)) return null;
  } else if (!/^\d{2}-\d{3}$/.test(recipient.postalCode)) return null;
  return recipient;
}

module.exports = async function checkout(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL, DROP_STAGING_WEB_CHECKOUT,
    DROP_STAGING_SUPABASE_URL, DROP_STAGING_SERVICE_KEY } = process.env;
  if (VERCEL_ENV !== 'preview' || DROP_STAGING_WEB_CHECKOUT !== 'enabled' || !DROP_STAGING_SERVICE_KEY ||
      !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(DROP_STAGING_SUPABASE_URL ?? '')) {
    return res.status(503).json({ error: 'checkout_disabled' });
  }

  // Deploy this endpoint behind Vercel Deployment Protection.
  const allowedOrigins = [VERCEL_URL, VERCEL_BRANCH_URL].filter(Boolean).map(host => 'https://' + host);
  if (!req.headers.origin || !allowedOrigins.includes(req.headers.origin)) {
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    return res.status(415).json({ error: 'unsupported_content_type' });
  }

  const body = req.body;
  if (!validCheckout(body)) return res.status(400).json({ error: 'invalid_request' });

  const recipient = normalizeRecipient(body.recipient, body.delivery);
  if (!recipient) return res.status(400).json({ error: 'invalid_recipient' });

  try {
    const headers = { apikey: DROP_STAGING_SERVICE_KEY, 'Content-Type': 'application/json' };
    if (!DROP_STAGING_SERVICE_KEY.startsWith('sb_secret_')) {
      headers.Authorization = 'Bearer ' + DROP_STAGING_SERVICE_KEY;
    }
    const url = new URL('/rest/v1/rpc/drop_create_cleanpro_test_order_with_delivery', DROP_STAGING_SUPABASE_URL);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_request_id: body.requestId,
        p_items: body.items,
        p_delivery: body.delivery,
        p_payment: body.payment,
        p_coupon: body.coupon,
        p_expected_total_grosz: body.expectedTotalGrosz,
        p_recipient: recipient
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const errors = { 400: 'invalid_recipient', 409: 'idempotency_conflict', 412: 'price_changed', 422: 'items_unavailable' };
      const error = errors[response.status];
      return res.status(error ? response.status : 502).json({ error: error || 'database_unavailable' });
    }

    const receipt = await response.json();
    if (!receipt || typeof receipt.orderId !== 'string' || !UUID_V4.test(receipt.orderId) ||
        receipt.totalGrosz !== body.expectedTotalGrosz) {
      return res.status(502).json({ error: 'invalid_receipt' });
    }
    return res.status(200).json({ orderId: receipt.orderId, totalGrosz: receipt.totalGrosz });
  } catch {
    return res.status(502).json({ error: 'database_unavailable' });
  }
};
