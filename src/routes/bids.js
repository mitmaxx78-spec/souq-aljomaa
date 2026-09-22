'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { query, withTransaction } = require('../lib/db');
const { makeId } = require('../lib/ids');
const { asyncRoute, badRequest, notFound, conflict } = require('../lib/errors');
const { normalizePhone, isCallable } = require('../lib/phone');

const router = express.Router();

const MIN_INCREMENT_MINOR = Number(process.env.MIN_BID_INCREMENT_MINOR) || 1000; // 1000 SYP

const bidSchema = z.object({
  bidderName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(1).max(40),
  amountMinor: z.coerce.number().int().positive(),
});

const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.BID_LIMIT_PER_MINUTE) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'زايدت كتير بسرعة، خد نفس وجرب كمان مرة' } },
});

router.post(
  '/:id/bids',
  bidLimiter,
  asyncRoute(async (req, res) => {
    const body = bidSchema.parse(req.body);
    const normalized = normalizePhone(body.phone);
    if (!isCallable(normalized)) {
      throw badRequest('رقم التلفون ناقص', { field: 'phone', reason: 'TOO_SHORT' });
    }

    // The whole read-check-write happens inside one transaction so two people
    // bidding in the same instant can't both read the same "current price"
    // and both believe they won -- the second writer here always sees the
    // first writer's committed bid before it decides whether its own is high
    // enough.
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, kind, status, current_price_minor, ends_at
           FROM listings WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!rows.length) throw notFound('الإعلان مو موجود');
      const listing = rows[0];

      if (listing.kind !== 'AUCTION') {
        throw badRequest('هاد الإعلان مو مزاد، فيك تتواصل مباشرة مع البايع');
      }
      if (listing.status !== 'APPROVED') {
        throw conflict('هاد المزاد مو شغال هلق');
      }
      if (listing.ends_at && new Date(listing.ends_at) <= new Date()) {
        await client.query(`UPDATE listings SET status = 'ENDED' WHERE id = $1`, [listing.id]);
        throw conflict('المزاد خلص، ما بينقبل مزايدات جديدة');
      }

      const minAllowed = Number(listing.current_price_minor) + MIN_INCREMENT_MINOR;
      if (body.amountMinor < minAllowed) {
        throw badRequest(`أقل مزايدة مقبولة هلق هي ${minAllowed}`, {
          field: 'amountMinor',
          minAllowed,
        });
      }

      const bidId = makeId('bid');
      await client.query(
        `INSERT INTO bids (id, listing_id, bidder_name, bidder_phone, amount_minor)
         VALUES ($1,$2,$3,$4,$5)`,
        [bidId, listing.id, body.bidderName, normalized, body.amountMinor]
      );
      await client.query(
        `UPDATE listings
            SET current_price_minor = $1, bid_count = bid_count + 1
          WHERE id = $2`,
        [body.amountMinor, listing.id]
      );

      return { bidId, amountMinor: body.amountMinor };
    });

    res.status(201).json(result);
  })
);

module.exports = { router };
