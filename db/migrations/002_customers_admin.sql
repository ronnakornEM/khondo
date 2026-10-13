-- Customer (buyer / renter) accounts, favourites, and a superuser flag for testing Premium.

ALTER TABLE users
  ADD COLUMN role         text    NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'customer')),
  ADD COLUMN name         text    NOT NULL DEFAULT '',
  ADD COLUMN phone        text    NOT NULL DEFAULT '',
  ADD COLUMN is_superuser boolean NOT NULL DEFAULT false;

-- Saved properties (guests keep theirs in the browser and merge them in on sign-in)
CREATE TABLE favorites (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);
CREATE INDEX favorites_property_idx ON favorites (property_id);

-- Inquiries sent while signed in are linked to the customer so they can see their history.
ALTER TABLE inquiries ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX inquiries_user_idx ON inquiries (user_id, created_at DESC);

-- Browse page: filter + sort over published listings
CREATE INDEX properties_browse_idx ON properties (published, status, created_at DESC);
