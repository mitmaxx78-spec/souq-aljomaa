-- سوق الجمعة — schema
--
-- migrate.js just re-runs this whole file every time (no migration numbering
-- yet, audience of one database). CREATE TABLE IF NOT EXISTS handles a fresh
-- install; the ALTER TABLE ... ADD COLUMN IF NOT EXISTS lines below exist
-- purely so this same file also brings an *already-deployed* database
-- (created before the wallet feature existed) up to date without a separate
-- migration script.
ALTER TABLE IF EXISTS sellers ADD COLUMN IF NOT EXISTS balance_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS flag_reason TEXT;
-- Optional pin location -- the seller drops a pin on the map (like eBay
-- Kleinanzeigen) instead of just typing a place name. Both NULL together
-- means "no pin was dropped"; the free-text `area` column stays required
-- either way, since not everyone will bother with the map.
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE IF EXISTS listings ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  -- A prepaid balance, topped up manually today (bank transfer / Sham Cash,
  -- confirmed by an admin) and spendable on paid perks like featuring a
  -- listing. The column and the ledger below are written the same way a real
  -- payment gateway's webhook would write them, so wiring one in later is
  -- "call this function automatically" rather than "redesign the money
  -- model" -- see wallet_ledger.
  balance_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per ad. kind decides which fields matter:
--   FIXED   -> price_minor is the asking price, buyer just contacts the seller
--   AUCTION -> starting_price_minor / current_price_minor / ends_at drive the bidding
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('FIXED', 'AUCTION')),
  price_minor BIGINT,
  starting_price_minor BIGINT,
  current_price_minor BIGINT,
  bid_count INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SYP',
  area TEXT NOT NULL,
  -- New ads sit here until an admin looks at them, so nothing fraudulent or
  -- fake goes live unattended -- a marketplace with no seller vetting is how
  -- OLX-style sites fill up with scam listings within days.
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SOLD', 'ENDED')),
  ends_at TIMESTAMPTZ,
  -- NULL or in the past = not featured. Featured listings sort first and get
  -- a "مميز" badge -- the one paid perk that exists today, bought with wallet
  -- balance rather than a live payment.
  featured_until TIMESTAMPTZ,
  -- Set automatically at submission time when the title/description matches
  -- the banned-word list (see src/lib/moderation.js). A flagged listing still
  -- needs a human's APPROVED before it goes live -- the filter narrows what
  -- an admin has to read closely, it never publishes anything by itself.
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS listings_status_kind_idx ON listings (status, kind);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings (category) WHERE status = 'APPROVED';
CREATE INDEX IF NOT EXISTS listings_ends_at_idx ON listings (ends_at) WHERE kind = 'AUCTION';

CREATE TABLE IF NOT EXISTS listing_images (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS listing_images_listing_idx ON listing_images (listing_id, sort_order);

-- Every bid is kept, not just the current high bid, so a dispute ("I bid
-- first / I bid more") can be settled by looking at the actual history
-- instead of trusting the running total on the listing row.
CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  bidder_name TEXT NOT NULL,
  bidder_phone TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bids_listing_idx ON bids (listing_id, amount_minor DESC);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A seller says "I sent X via Sham Cash / bank transfer, here's the
-- reference", and it sits PENDING until an admin checks their own account and
-- confirms the money actually arrived before crediting the balance. This is
-- the manual stand-in for a payment gateway webhook -- swapping in a real
-- gateway later means auto-approving these instead of a human tapping
-- "وصلت"، the rest of the money flow (balance, ledger, spending it) stays
-- identical.
CREATE TABLE IF NOT EXISTS topup_requests (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL,
  reference_note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS topup_requests_status_idx ON topup_requests (status, created_at);

-- Every change to a seller's balance -- a topup landing or a perk being
-- bought -- gets one row here, signed positive or negative. The seller's
-- balance_minor is always derivable by summing this table for them, so a
-- dispute ("where did my balance go?") is answered by reading history
-- instead of trusting a single mutable number.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers(id),
  amount_minor BIGINT NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_ledger_seller_idx ON wallet_ledger (seller_id, created_at DESC);

-- Banner slots for external ads / affiliate links -- a second revenue line
-- alongside listing fees, managed the same way site_content is: from
-- /admin, no deploy needed.
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  placement TEXT NOT NULL DEFAULT 'home_banner',
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ads_placement_idx ON ads (placement, is_active, sort_order);

-- A buyer flagging a specific listing ("هاد نصب", "ممنوع", "مش متل الصورة").
-- Kept separate from support_tickets below because a report always points at
-- one listing and drives the same PENDING-review queue admin already checks;
-- a general question doesn't.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  reporter_phone TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at);

-- Everything else the small help widget collects: a dispute between a buyer
-- and seller, a question, a complaint that isn't about one specific listing.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, created_at);
