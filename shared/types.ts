// API contract (JSON over HTTPS). Used by the web app today and any native client tomorrow.
import type { PlanId } from './plans';

export const PROPERTY_TYPES = ['condo', 'house', 'townhouse', 'apartment', 'land', 'commercial', 'other'] as const;
export const LISTING_TYPES = ['sale', 'rent', 'both'] as const;
export const PROPERTY_STATUSES = ['available', 'reserved', 'sold', 'rented'] as const;
export const CONTACT_KINDS = ['buyer', 'seller', 'tenant', 'landlord', 'partner', 'other'] as const;
export const CONTACT_STAGES = ['new', 'contacted', 'viewing', 'negotiating', 'won', 'lost'] as const;
export const BILL_KINDS = ['rent', 'deposit', 'commission', 'utility', 'service', 'other'] as const;
export const BILL_STATUSES = ['draft', 'sent', 'paid', 'void'] as const;
export const EVENT_KINDS = ['viewing', 'meeting', 'call', 'signing', 'task', 'other'] as const;
export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export const LANDING_THEMES = ['classic', 'modern', 'minimal'] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type ListingType = (typeof LISTING_TYPES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type ContactKind = (typeof CONTACT_KINDS)[number];
export type ContactStage = (typeof CONTACT_STAGES)[number];
export type BillKind = (typeof BILL_KINDS)[number];
export type BillStatus = (typeof BILL_STATUSES)[number];
export type EventKind = (typeof EVENT_KINDS)[number];
export type Recurrence = (typeof RECURRENCES)[number];
export type LandingTheme = (typeof LANDING_THEMES)[number];

export interface LandingSettings {
  theme: LandingTheme;
  accent: string; // hex colour
  heroTitle: string;
  heroSubtitle: string;
  coverUrl: string;
  announcement: string; // premium
  showAbout: boolean;
  showContact: boolean;
  showSold: boolean; // show sold / rented listings as a track record
  facebook: string;
  instagram: string;
  website: string;
}

export const DEFAULT_LANDING: LandingSettings = {
  theme: 'classic',
  accent: '#0f766e',
  heroTitle: '',
  heroSubtitle: '',
  coverUrl: '',
  announcement: '',
  showAbout: true,
  showContact: true,
  showSold: true,
  facebook: '',
  instagram: '',
  website: '',
};

export interface Agent {
  id: string;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  phone: string;
  lineId: string;
  contactEmail: string;
  avatarUrl: string;
  landing: LandingSettings;
  plan: PlanId;
  planRenewsAt: string | null;
  createdAt: string;
}

export interface Property {
  id: string;
  agentId: string;
  title: string;
  description: string;
  type: PropertyType;
  listingType: ListingType;
  status: PropertyStatus;
  price: number | null;
  rentPrice: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number | null;
  landSqw: number | null;
  floor: number | null;
  address: string;
  district: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  photos: string[];
  featured: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PropertyInput = Omit<Property, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>;

export interface Inquiry {
  id: string;
  propertyId: string | null;
  propertyTitle?: string | null;
  name: string;
  phone: string;
  email: string;
  message: string;
  handled: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  lineId: string;
  kind: ContactKind;
  stage: ContactStage;
  source: string;
  propertyId: string | null;
  propertyTitle?: string | null;
  budget: number | null;
  tags: string[];
  notes: string;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Bill {
  id: string;
  number: string;
  contactId: string | null;
  contactName?: string | null;
  propertyId: string | null;
  propertyTitle?: string | null;
  kind: BillKind;
  status: BillStatus;
  items: BillItem[];
  total: number;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  paidAt: string | null;
  notes: string;
  overdue: boolean; // derived: sent and past due
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  kind: EventKind;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
  contactId: string | null;
  contactName?: string | null;
  propertyId: string | null;
  propertyTitle?: string | null;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
  reminderMinutes: number | null;
}

export interface MeResponse {
  role: 'agent';
  isSuperuser: boolean;
  agent: Agent;
  usage: { properties: number };
  hiddenProperties: number; // published listings not shown publicly because of the plan limit
  calendarFeedUrl: string | null;
}

export interface CustomerMeResponse {
  role: 'customer';
  isSuperuser: boolean;
  user: { id: string; email: string; name: string; phone: string };
}

export interface PublicAgentResponse {
  agent: Omit<Agent, 'plan' | 'planRenewsAt' | 'createdAt'> & { showBranding: boolean };
  properties: Property[];
}

export interface DashboardResponse {
  properties: Record<PropertyStatus, number>;
  newInquiries: number;
  upcomingEvents: CalendarEvent[];
  outstanding: { count: number; total: number; overdue: number } | null; // premium only
  contactsByStage: Record<ContactStage, number> | null; // premium only
}

export interface AgentChip {
  slug: string;
  displayName: string;
  avatarUrl: string;
  headline: string;
}

/** A property as shown in marketplace lists (browse, saved), with the agent that owns it. */
export type PropertyWithAgent = Property & { agent: AgentChip };

export interface BrowseResponse {
  items: PropertyWithAgent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicPropertyResponse {
  agent: PublicAgentResponse['agent'];
  property: Property;
  others: Property[]; // other live listings of the same agent
  othersTotal: number;
}

export interface MyInquiry {
  id: string;
  message: string;
  createdAt: string;
  propertyId: string | null;
  propertyTitle: string | null;
  propertyPhoto: string | null;
  agentSlug: string;
  agentName: string;
  agentPhone: string;
  agentLineId: string;
  agentEmail: string;
}

export interface AdminOverview {
  totals: { agents: number; customers: number; premium: number; properties: number; inquiries: number };
  agents: { id: string; slug: string; displayName: string; plan: PlanId; planRenewsAt: string | null; createdAt: string; email: string; isSuperuser: boolean; properties: number; hasStripe: boolean }[];
}
