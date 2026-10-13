import './env.js';
import { PRICE_LOOKUP_KEY, stripeEnabled, stripeMode, stripeRequest } from './stripe.js';
import { PREMIUM_PRICE_THB_PER_MONTH } from '../shared/plans.js';

// One-time Stripe setup (sandbox by default):
//   STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup
//   npm run stripe:setup -- --webhook https://your-app.vercel.app/api/billing/webhook   (also registers the webhook)
// Idempotent: reuses the product/price/webhook if they already exist.
const args = process.argv.slice(2);
if (!stripeEnabled()) {
  console.error('Set STRIPE_SECRET_KEY (use a *test* key from https://dashboard.stripe.com/test/apikeys).');
  process.exit(1);
}
if (stripeMode() === 'live' && !args.includes('--live')) {
  console.error('That is a LIVE key. Use a sk_test_… key, or pass --live if you really mean it.');
  process.exit(1);
}

const prices = await stripeRequest<{ data: { id: string }[] }>('GET', 'prices', { 'lookup_keys[]': PRICE_LOOKUP_KEY, active: 'true', limit: '1' });
let priceId = prices.data[0]?.id;
if (!priceId) {
  const product = await stripeRequest('POST', 'products', { name: 'Khondo Premium', description: 'Contacts, bills, advanced calendar and more listings for real estate agents.' });
  const price = await stripeRequest('POST', 'prices', {
    product: product.id,
    currency: 'thb',
    unit_amount: String(PREMIUM_PRICE_THB_PER_MONTH * 100),
    'recurring[interval]': 'month',
    lookup_key: PRICE_LOOKUP_KEY,
  });
  priceId = price.id;
  console.log(`Created product ${product.id} and price ${priceId} (฿${PREMIUM_PRICE_THB_PER_MONTH}/month)`);
} else {
  console.log(`Found existing price ${priceId}`);
}
console.log(`\nSTRIPE_PRICE_ID=${priceId}   # optional – the app also finds the price by its lookup key "${PRICE_LOOKUP_KEY}"`);

// The Customer Portal ("Manage subscription") only works once a default configuration exists.
const portals = await stripeRequest<{ data: { id: string; is_default: boolean }[] }>('GET', 'billing_portal/configurations', { limit: '10' });
if (portals.data.some((c) => c.is_default)) {
  console.log('Customer portal already configured');
} else {
  const cfg = await stripeRequest('POST', 'billing_portal/configurations', {
    name: 'Khondo default',
    'business_profile[headline]': 'Manage your Khondo Premium subscription',
    'features[invoice_history][enabled]': 'true',
    'features[payment_method_update][enabled]': 'true',
    'features[customer_update][enabled]': 'true',
    'features[customer_update][allowed_updates][0]': 'email',
    'features[customer_update][allowed_updates][1]': 'name',
    'features[customer_update][allowed_updates][2]': 'phone',
    'features[customer_update][allowed_updates][3]': 'address',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
  });
  console.log(`Created customer portal configuration ${cfg.id}`);
}

const wh = args.indexOf('--webhook');
if (wh >= 0 && args[wh + 1]) {
  const url = args[wh + 1];
  const existing = await stripeRequest<{ data: { id: string; url: string }[] }>('GET', 'webhook_endpoints', { limit: '100' });
  if (existing.data.some((e) => e.url === url)) {
    console.log(`Webhook for ${url} already exists (its signing secret is only shown at creation — see the Stripe dashboard).`);
  } else {
    const ep = await stripeRequest('POST', 'webhook_endpoints', {
      url,
      'enabled_events[0]': 'checkout.session.completed',
      'enabled_events[1]': 'customer.subscription.created',
      'enabled_events[2]': 'customer.subscription.updated',
      'enabled_events[3]': 'customer.subscription.deleted',
    });
    console.log(`\nSTRIPE_WEBHOOK_SECRET=${ep.secret}`);
  }
} else {
  console.log('\nFor local webhooks run:  stripe listen --forward-to localhost:3001/api/billing/webhook   (prints a whsec_… secret)');
  console.log('Without it the app still works: it syncs the subscription when you return from Checkout.');
}
