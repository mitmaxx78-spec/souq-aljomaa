'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { query } = require('../lib/db');
const { makeId } = require('../lib/ids');
const { asyncRoute, badRequest, notFound } = require('../lib/errors');
const { normalizePhone, isCallable } = require('../lib/phone');
const { scan } = require('../lib/moderation');

const router = express.Router();

const CATEGORIES = [
  'سيارات', 'عقارات', 'مزارع وأراضي', 'حيوانات ومواشي', 'أثاث', 'إلكترونيات',
  'أجهزة منزلية', 'ملابس', 'وظائف', 'أخرى',
];

// Job posts don't have a "price" the way a fridge does -- salary is often
// "يذكر عند التواصل" -- so this one category is exempt from the FIXED-kind
// price requirement below, and always sold as a plain announcement (no auction).
const NO_PRICE_CATEGORIES = new Set(['وظائف']);

function requireCallablePhone(raw) {
  const normalized = normalizePhone(raw);
  if (!isCallable(normalized)) {
    throw badRequest('رقم التلفون ناقص', { field: 'phone', reason: 'TOO_SHORT' });
  }
  return normalized;
}

const createSchema = z.object({
  sellerName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(1).max(40),
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(2000),
  area: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  kind: z.enum(['FIXED', 'AUCTION']),
  priceMinor: z.coerce.number().int().positive().optional(),
  startingPriceMinor: z.coerce.number().int().positive().optional(),
  durationHours: z.coerce.number().int().min(1).max(24 * 14).optional(),
  images: z.array(z.string().url()).max(8).optional(),
  website: z.string().max(500).optional(), // honeypot
});

// A new ad every 30s from one IP is someone testing the form badly, not a
// second real seller -- keeps the pending queue from filling with junk before
// an admin ever sees it.
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.LISTING_LIMIT_PER_HOUR) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'كتير إعلانات بوقت قصير، جرب بعد شوي' } },
});

router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const kind = req.query.kind === 'AUCTION' || req.query.kind === 'FIXED' ? req.query.kind : null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : null;
    const area = typeof req.query.area === 'string' ? req.query.area.trim().slice(0, 120) : null;

    const clauses = [`status = 'APPROVED'`];
    const params = [];
    if (kind) {
      params.push(kind);
      clauses.push(`kind = $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    if (area) {
      params.push(`%${area}%`);
      clauses.push(`area ILIKE $${params.length}`);
    }
    // A live auction with an expired clock should stop taking bids even
    // before the sweep job marks it ENDED -- the list view is where a buyer
    // would otherwise be misled into bidding on something already over.
    clauses.push(`(kind = 'FIXED' OR ends_at > NOW())`);

    const { rows } = await query(
      `SELECT id, category, title, kind, price_minor, current_price_minor,
              starting_price_minor, bid_count, currency, area, ends_at, created_at,
              (featured_until IS NOT NULL AND featured_until > NOW()) AS is_featured
         FROM listings
        WHERE ${clauses.join(' AND ')}
        ORDER BY is_featured DESC, created_at DESC
        LIMIT 100`,
      params
    );
    res.json({ listings: rows });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM listings WHERE id = $1 AND status IN ('APPROVED', 'SOLD', 'ENDED')`,
      [req.params.id]
    );
    if (!rows.length) throw notFound('الإعلان مو موجود');

    const listing = rows[0];
    const images = await query(
      'SELECT url FROM listing_images WHERE listing_id = $1 ORDER BY sort_order',
      [listing.id]
    );
    let bids = [];
    if (listing.kind === 'AUCTION') {
      const b = await query(
        `SELECT bidder_name, amount_minor, created_at FROM bids
          WHERE listing_id = $1 ORDER BY amount_minor DESC, created_at ASC LIMIT 10`,
        [listing.id]
      );
      bids = b.rows;
    }
    res.json({ listing, images: images.rows.map((r) => r.url), bids });
  })
);

router.post(
  '/',
  createLimiter,
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);

    // Honeypot: a real visitor never fills a field hidden with CSS. Return
    // 201 with a fake id so a bot doesn't learn its submission was dropped.
    if (body.website) {
      return res.status(201).json({ id: makeId('lst') });
    }

    const skipPrice = NO_PRICE_CATEGORIES.has(body.category);
    if (body.kind === 'FIXED' && !body.priceMinor && !skipPrice) {
      throw badRequest('لازم تحط السعر', { field: 'priceMinor' });
    }
    if (body.kind === 'AUCTION' && !body.startingPriceMinor) {
      throw badRequest('لازم تحط سعر الانطلاق للمزاد', { field: 'startingPriceMinor' });
    }

    // Checked before touching the database at all -- a submission naming
    // something outright illegal never becomes a row, never gets a seller
    // upserted for it, never enters the review queue. Checked against title
    // and description together, since either one can carry the term.
    const modCheck = scan(`${body.title} ${body.description}`);
    if (modCheck.blocked) {
      throw badRequest('هاد المحتوى غير مسموح فيه على الموقع', { field: 'description', reason: 'BLOCKED_CONTENT' });
    }

    const phone = requireCallablePhone(body.phone);

    // upsert the seller by phone
    const sellerId = makeId('slr');
    const sellerRes = await query(
      `INSERT INTO sellers (id, name, phone)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [sellerId, body.sellerName, phone]
    );
    const resolvedSellerId = sellerRes.rows[0].id;

    const listingId = makeId('lst');
    const endsAt = body.kind === 'AUCTION'
      ? new Date(Date.now() + (body.durationHours || 48) * 3600 * 1000)
      : null;

    await query(
      `INSERT INTO listings
         (id, seller_id, category, title, description, kind, price_minor,
          starting_price_minor, current_price_minor, area, lat, lng, ends_at, is_flagged, flag_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        listingId, resolvedSellerId, body.category, body.title, body.description, body.kind,
        body.kind === 'FIXED' ? body.priceMinor : null,
        body.kind === 'AUCTION' ? body.startingPriceMinor : null,
        body.kind === 'AUCTION' ? body.startingPriceMinor : null,
        body.area, body.lat ?? null, body.lng ?? null, endsAt, modCheck.flagged, modCheck.flagged ? modCheck.term : null,
      ]
    );

    if (body.images && body.images.length) {
      for (let i = 0; i < body.images.length; i++) {
        await query(
          'INSERT INTO listing_images (id, listing_id, url, sort_order) VALUES ($1,$2,$3,$4)',
          [makeId('img'), listingId, body.images[i], i]
        );
      }
    }

    // sellerId is the account key for /me -- the seller needs it to see their
    // balance, request a topup, or feature this same listing later, so it has
    // to come back on the very first response, not be something they have to
    // ask for separately.
    res.status(201).json({ id: listingId, sellerId: resolvedSellerId, status: 'PENDING' });
  })
);

module.exports = { router, CATEGORIES };
