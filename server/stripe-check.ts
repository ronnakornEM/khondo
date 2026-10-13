import './env.js';
import { PRICE_LOOKUP_KEY, resolvePriceId, stripeEnabled, stripeMode, stripeRequest } from './stripe.js';

// Read-only health check of the Stripe configuration the app will use:   npm run stripe:check
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => {
  console.log(`  ✗ ${m}`);
  failed = true;
};
let failed = false;

console.log('Stripe configuration');
if (!stripeEnabled()) {
  bad('STRIPE_SECRET_KEY is not set (use the sk_test_… key from https://dashboard.stripe.com/test/apikeys)');
  process.exit(1);
}
ok(`secret key present – ${stripeMode() === 'test' ? 'SANDBOX (test mode)' : 'LIVE mode'}`);

try {
  const id = await resolvePriceId();
  const price = await stripeRequest<any>('GET', `prices/${id}`);
  const amount = price.unit_amount / 100;
  if (price.recurring?.interval === 'month' && price.currency === 'thb') ok(`price ${id}: ฿${amount}/month (lookup key ${price.lookup_key ?? PRICE_LOOKUP_KEY})`);
  else bad(`price ${id} is ${price.currency} ${amount} ${price.recurring?.interval ?? 'one-time'} – expected a monthly THB price`);
} catch (e: any) {
  bad(`no usable price: ${e.message}. Run "npm run stripe:setup"`);
}

try {
  const cfgs = await stripeRequest<{ data: { id: string; is_default: boolean }[] }>('GET', 'billing_portal/configurations', { limit: '10' });
  if (cfgs.data.some((c) => c.is_default)) ok('customer portal configured (Manage subscription works)');
  else bad('no default customer portal configuration – run "npm run stripe:setup"');
} catch (e: any) {
  bad(`could not read portal configuration: ${e.message}`);
}

console.log(process.env.STRIPE_WEBHOOK_SECRET ? '  ✓ STRIPE_WEBHOOK_SECRET set' : '  • STRIPE_WEBHOOK_SECRET not set – fine: the app syncs the subscription when users return from Checkout');
process.exit(failed ? 1 : 0);
