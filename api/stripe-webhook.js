const { sandboxEnabled, verifyStripeEvent, applyStripeEvent } = require('../server/stripe-sandbox');

module.exports = async function stripeWebhook(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!sandboxEnabled()) return res.status(503).json({ error: 'sandbox_disabled' });
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 256 * 1024) return res.status(413).json({ error: 'payload_too_large' });
      chunks.push(Buffer.from(chunk));
    }
    const event = verifyStripeEvent(Buffer.concat(chunks), req.headers['stripe-signature'],
      process.env.DROP_STRIPE_WEBHOOK_SECRET);
    if (!event || event.livemode !== false) return res.status(400).json({ error: 'invalid_test_event' });
    await applyStripeEvent(event);
    return res.status(200).json({ received: true });
  } catch {
    return res.status(502).json({ error: 'payment_event_unavailable' });
  }
};
