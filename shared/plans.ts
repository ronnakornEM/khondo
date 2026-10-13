// Freemium rules shared by the API (enforcement) and the UI (messaging).
// Keep this file dependency-free so a future React Native app can import it too.

export type PlanId = 'free' | 'premium';

export interface PlanLimits {
  label: string;
  maxProperties: number;
  maxPhotosPerProperty: number;
  contacts: boolean; // contact management (CRM)
  bills: boolean; // bills / invoices
  advancedCalendar: boolean; // week/day views, recurrence, reminders, links, bill overlay, .ics feed
  premiumThemes: boolean; // extra landing page themes + announcement banner
  removeBranding: boolean; // hides "Made with Khondo" on the landing page
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    label: 'Free',
    maxProperties: 5,
    maxPhotosPerProperty: 6,
    contacts: false,
    bills: false,
    advancedCalendar: false,
    premiumThemes: false,
    removeBranding: false,
  },
  premium: {
    label: 'Premium',
    maxProperties: 200,
    maxPhotosPerProperty: 30,
    contacts: true,
    bills: true,
    advancedCalendar: true,
    premiumThemes: true,
    removeBranding: true,
  },
};

export const PREMIUM_PRICE_THB_PER_MONTH = 299;

export type PremiumFeature = 'contacts' | 'bills' | 'advancedCalendar' | 'premiumThemes';

export const FEATURE_LABELS: Record<PremiumFeature, string> = {
  contacts: 'Contact management',
  bills: 'Bills & invoices',
  advancedCalendar: 'Advanced calendar',
  premiumThemes: 'Premium landing page themes',
};
