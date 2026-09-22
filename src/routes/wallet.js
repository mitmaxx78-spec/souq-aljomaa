'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { query, withTransaction } = require('../lib/db');
const { makeId } = require('../lib/ids');
const { asyncRoute, badRequest, notFound, conflict } = require('../lib/errors');
const { spend, FEATURE_COST_MINOR, FEATURE_DAYS } = require('../lib/wallet');

const router = express.Router();

const METHODS = ['SHAM_CASH', 'BANK_TRANSFER', 'OTHER'];

const topupSchema = z.object({
  sellerId: z.string().min(3).max(60),
  amountMinor: z.coerce.number().int().positive(),
  method: z.enum(METHODS),
  referenceNote: z.string().trim().max(300).optional(),
});

const topupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.TOPUP_LIMIT_PER_HOUR) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'كتير طلبات شحن بوقت قصير' } },
});

// The seller id doubles as a lightweight account key -- it is a long random
// token, never guessable, and is exactly what /sell hands back after posting
// a listing ("save this link"). It is not a password: anyone who has the
// link can see that seller's balance and listings, same trust level as every
// other flow on this site (phone number as identity). Good enough for an
// MVP where nothing more sensitive than a wallet balance and ad listings sits
// behind it; upgrading to real accounts later does not require touching the
// money model above it.
router.get(
  '/me/:sellerId',
  asyncRoute(async (req, res) => {
    const seller = await query(
      'SELECT id, name, phone, balance_minor FROM sellers WHERE id = $1',
      [req.params.sellerId]
    );
    if (!seller.rows.length) throw notFound('حساب غير موجود');

    const listings = await query(
      `SELECT id, title, kind, status, price_minor, current_price_minor, currency,
              featured_until, created_at
         FROM listings WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.sellerId]
    );
    const topups = await query(
      `SELECT id, amount_minor, method, status, created_at
         FROM topup_requests WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.sellerId]
    );

    res.json({
      seller: seller.rows[0],
      listings: listings.rows,
      topups: topups.rows,
      featureCostMinor: FEATURE_COST_MINOR,
      featureDays: FEATURE_DAYS,
    });
  })
);

router.post(
  '/topups',
  topupLimiter,
  asyncRoute(async (req, res) => {
    const body = topupSchema.parse(req.body);
    const seller = await query('SELECT id FROM sellers WHERE id = $1', [body.sellerId]);
    if (!seller.rows.length) throw notFound('حساب غير موجود');

    const id = makeId('top');
    await query(
      `INSERT INTO topup_requests (id, seller_id, amount_minor, method, reference_note)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, body.sellerId, body.amountMinor, body.method, body.referenceNote || null]
    );
    res.status(201).json({ id, status: 'PENDING' });
  })
);

router.post(
  '/listings/:id/feature',
  asyncRoute(async (req, res) => {
    const { sellerId } = z.object({ sellerId: z.string().min(3).max(60) }).parse(req.body);

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT id, seller_id, status FROM listings WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!rows.length) throw notFound('الإعلان مو موجود');
      const listing = rows[0];
      if (listing.seller_id !== sellerId) throw badRequest('هاد الإعلان مو إلك');
      if (listing.status !== 'APPROVED') throw conflict('لازم الإعلان يكون منشور الأول');

      const ok = await spend(client, sellerId, FEATURE_COST_MINOR, 'FEATURE_LISTING', listing.id);
      if (!ok) throw conflict('رصيدك مو كافي، اشحن رصيدك الأول', { needed: FEATURE_COST_MINOR });

      await client.query(
        `UPDATE listings SET featured_until = NOW() + ($1 || ' days')::interval WHERE id = $2`,
        [FEATURE_DAYS, listing.id]
      );
      return { featuredDays: FEATURE_DAYS };
    });

    res.json(result);
  })
);

router.get('/config', (req, res) => {
  res.json({ methods: METHODS, featureCostMinor: FEATURE_COST_MINOR, featureDays: FEATURE_DAYS });
});

module.exports = { router };
