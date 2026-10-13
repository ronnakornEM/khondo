import { DEFAULT_LANDING, type Agent, type LandingSettings, type PublicAgentResponse } from '../shared/types.js';
import type { AgentRow } from './auth.js';
import { PLANS } from '../shared/plans.js';

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function landingOf(row: { landing: Record<string, unknown> }): LandingSettings {
  return { ...DEFAULT_LANDING, ...(row.landing as Partial<LandingSettings>) };
}

export function toAgent(a: AgentRow): Agent {
  return {
    id: a.id,
    slug: a.slug,
    displayName: a.displayName,
    headline: a.headline,
    bio: a.bio,
    phone: a.phone,
    lineId: a.lineId,
    contactEmail: a.contactEmail,
    avatarUrl: a.avatarUrl,
    landing: landingOf(a),
    plan: a.plan,
    planRenewsAt: iso(a.planRenewsAt),
    createdAt: iso(a.createdAt)!,
  };
}

export function toPublicAgent(a: AgentRow): PublicAgentResponse['agent'] {
  const { plan, planRenewsAt, createdAt, ...rest } = toAgent(a);
  return { ...rest, showBranding: !PLANS[a.plan].removeBranding };
}

export function propertyOut(r: any) {
  return { ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) };
}

export function eventOut(r: any) {
  return {
    ...r,
    startAt: iso(r.startAt),
    endAt: iso(r.endAt),
    createdAt: undefined,
    updatedAt: undefined,
  };
}
