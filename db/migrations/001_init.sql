-- Khondo initial schema (PostgreSQL / Neon)
-- All timestamps are timestamptz. Money is numeric(14,2) in THB by default.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- One agent profile per user. Holds the public landing page settings and the subscription plan.
CREATE TABLE agents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug                    text NOT NULL,
  display_name            text NOT NULL,
  headline                text NOT NULL DEFAULT '',
  bio                     text NOT NULL DEFAULT '',
  phone                   text NOT NULL DEFAULT '',
  line_id                 text NOT NULL DEFAULT '',
  contact_email           text NOT NULL DEFAULT '',
  avatar_url              text NOT NULL DEFAULT '',
  landing                 jsonb NOT NULL DEFAULT '{}'::jsonb,   -- theme, accent, hero, section toggles, socials
  plan                    text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  plan_renews_at          timestamptz,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  calendar_token          text NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),  -- secret for the .ics feed
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agents_slug_key ON agents (lower(slug));
CREATE INDEX agents_stripe_customer_idx ON agents (stripe_customer_id);

CREATE TABLE properties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  type          text NOT NULL DEFAULT 'condo'
                CHECK (type IN ('condo', 'house', 'townhouse', 'apartment', 'land', 'commercial', 'other')),
  listing_type  text NOT NULL DEFAULT 'sale' CHECK (listing_type IN ('sale', 'rent', 'both')),
  status        text NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'reserved', 'sold', 'rented')),
  price         numeric(14,2),            -- sale price
  rent_price    numeric(14,2),            -- monthly rent
  bedrooms      smallint,
  bathrooms     smallint,
  area_sqm      numeric(10,2),            -- usable area, m²
  land_sqw      numeric(10,2),            -- land area, square wah (ตารางวา)
  floor         smallint,
  address       text NOT NULL DEFAULT '',
  district      text NOT NULL DEFAULT '',
  province      text NOT NULL DEFAULT 'Khon Kaen',
  latitude      double precision,
  longitude     double precision,
  amenities     text[] NOT NULL DEFAULT '{}',
  photos        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ["https://…", …] first = cover
  featured      boolean NOT NULL DEFAULT false,
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_agent_idx ON properties (agent_id, created_at DESC);

-- Messages sent from public landing pages (available to every plan).
CREATE TABLE inquiries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  property_id  uuid REFERENCES properties(id) ON DELETE SET NULL,
  name         text NOT NULL,
  phone        text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  message      text NOT NULL DEFAULT '',
  handled      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiries_agent_idx ON inquiries (agent_id, created_at DESC);

-- Premium: contact management (mini CRM)
CREATE TABLE contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name          text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  email         text NOT NULL DEFAULT '',
  line_id       text NOT NULL DEFAULT '',
  kind          text NOT NULL DEFAULT 'buyer'
                CHECK (kind IN ('buyer', 'seller', 'tenant', 'landlord', 'partner', 'other')),
  stage         text NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new', 'contacted', 'viewing', 'negotiating', 'won', 'lost')),
  source        text NOT NULL DEFAULT 'manual',
  property_id   uuid REFERENCES properties(id) ON DELETE SET NULL,
  budget        numeric(14,2),
  tags          text[] NOT NULL DEFAULT '{}',
  notes         text NOT NULL DEFAULT '',
  last_contacted_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_agent_idx ON contacts (agent_id, updated_at DESC);

-- Premium: bills / invoices
CREATE TABLE bills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  number        text NOT NULL,
  contact_id    uuid REFERENCES contacts(id) ON DELETE SET NULL,
  property_id   uuid REFERENCES properties(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'rent'
                CHECK (kind IN ('rent', 'deposit', 'commission', 'utility', 'service', 'other')),
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{description, qty, unitPrice}]
  total         numeric(14,2) NOT NULL DEFAULT 0,
  issue_date    date NOT NULL DEFAULT current_date,
  due_date      date,
  paid_at       timestamptz,
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, number)
);
CREATE INDEX bills_agent_idx ON bills (agent_id, issue_date DESC);

-- Calendar events (basic for free; recurrence/links/reminders are premium)
CREATE TABLE events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  kind             text NOT NULL DEFAULT 'meeting'
                   CHECK (kind IN ('viewing', 'meeting', 'call', 'signing', 'task', 'other')),
  start_at         timestamptz NOT NULL,
  end_at           timestamptz NOT NULL,
  all_day          boolean NOT NULL DEFAULT false,
  location         text NOT NULL DEFAULT '',
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,
  property_id      uuid REFERENCES properties(id) ON DELETE SET NULL,
  recurrence       text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  recurrence_until date,
  reminder_minutes integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at >= start_at)
);
CREATE INDEX events_agent_idx ON events (agent_id, start_at);
