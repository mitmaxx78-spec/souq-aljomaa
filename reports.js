'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { query } = require('../lib/db');
const { makeId } = require('../lib/ids');
const { asyncRoute, notFound } = require('../lib/errors');

const router = express.Router();

const REASONS = ['SCAM', 'PROHIBITED', 'WRONG_INFO', 'OFFENSIVE', 'OTHER'];

const reportSchema = z.object({
  reason: z.enum(REASONS),
  note: z.string().trim().max(1000).optional(),
  phone: z.string().trim().max(40).optional(),
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REPORT_LIMIT_PER_HOUR) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'كتير بلاغات بوقت قصير' } },
});

router.post(
  '/:listingId/reports',
  reportLimiter,
  asyncRoute(async (req, res) => {
    const body = reportSchema.parse(req.body);
    const listing = await query('SELECT id FROM listings WHERE id = $1', [req.params.listingId]);
    if (!listing.rows.length) throw notFound('الإعلان مو موجود');

    const id = makeId('rpt');
    await query(
      `INSERT INTO reports (id, listing_id, reporter_phone, reason, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, req.params.listingId, body.phone || null, body.reason, body.note || null]
    );
    res.status(201).json({ id, status: 'PENDING' });
  })
);

module.exports = { router, REASONS };
