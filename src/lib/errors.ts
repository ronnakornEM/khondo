import { ApiError } from './api';
import type { TFn } from './i18n';

// The API sends English messages plus a stable `code`. Show the translated text for known codes and fall back
// to translating the raw message (works for any message that has a dictionary entry), then to English.
const BY_CODE: Record<string, string> = {
  network: 'Cannot reach the server. Check your connection.',
  unauthorized: 'Session expired, please sign in again',
  bad_credentials: 'Incorrect email or password',
  email_taken: 'An account with this email already exists',
  slug_taken: 'That address is already taken',
  premium_required: 'This feature is part of Khondo Premium',
  property_limit: 'You have reached the property limit of your plan. Upgrade to add more.',
  photo_limit: 'You have reached the photo limit of your plan. Upgrade to add more.',
  rate_limited: 'Too many messages — please try again later',
  uploads_disabled: 'Photo upload is not configured on this server. Paste an image URL instead.',
  billing_disabled: 'Payments are not configured yet',
  already_premium: 'You are already on Premium',
  internal: 'Something went wrong on our side',
  not_found: 'Not found',
};

export function errorText(t: TFn, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code && BY_CODE[err.code]) return t(BY_CODE[err.code]);
    return t(err.message);
  }
  return err instanceof Error ? t(err.message) : t(String(err));
}
