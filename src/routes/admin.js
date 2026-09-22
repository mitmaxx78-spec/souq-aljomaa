'use strict';

const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../lib/db');
const { makeId } = require('../lib/ids');
const { asyncRoute, forbidden, badRequest, notFound, conflict } = require('../lib/errors');
const { DEFAULTS, FIELDS, LABELS } = require('../lib/content');
const { invalidate } = require('../lib/pages');
const { credit } = require('../lib/wallet');

const router = express.Router();

// A flat shared key, same pattern as the wallet admin console: Rex types it
// once into his phone's browser and it stays there. No user accounts to lose
// track of, no password reset flow to build for an audience of one.
router.use((req, res, next) => {
  const key = req.get('x-admin-key');
  if (!key || key !== process.env.ADMIN_API_KEY) {
    throw forbidden('مفتاح الإدارة غلط');
  }
  next();
});

router.get(
  '/listings',
  asyncRoute(async (req, res) => {
    const status = ['PENDING', 'APPROVED', 'REJECTED', 'SOLD', 'ENDED'].includes(req.query.status)
      ? req.query.status
      : 'PENDING';
    const { rows } = await query(
      `SELECT l.*, s.name AS seller_name, s.phone AS seller_phone
         FROM listings l JOIN sellers s ON s.id = l.seller_id
        WHERE l.status = $1
        ORDER BY l.created_at DESC
        LIMIT 200`,
      [status]
    );
    const counts = await query(
      `SELECT status, COUNT(*)::int AS n FROM listings GROUP BY status`
    );
    res.json({ listings: rows, counts: counts.rows });
  })
);

router.patch(
  '/listings/:id',
  asyncRoute(async (req, res) => {
    const allowed = ['APPROVED', 'REJECTED', 'SOLD', 'ENDED'];
    const { status } = req.body || {};
    if (!allowed.includes(status)) {
      throw badRequest('حالة غير معروفة', { allowed });
    }
    await query(
      'UPDATE listings SET status = $1, reviewed_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );
    res.json({ ok: true });
  })
);

router.get(
  '/content',
  asyncRoute(async (req, res) => {
    const { rows } = await query('SELECT key, value FROM site_content');
    const overrides = {};
    for (const r of rows) overrides[r.key] = r.value;

    const groups = FIELDS.map((g) => ({
      group: g.group,
      fields: g.keys.map((key) => ({
        key,
        label: LABELS[key] || key,
        value: key in overrides ? overrides[key] : DEFAULTS[key],
        isDefault: !(key in overrides),
      })),
    }));
    res.json({ groups });
  })
);

router.put(
  '/content',
  asyncRoute(async (req, res) => {
    const updates = req.body || {};
    for (const [key, value] of Object.entries(updates)) {
      if (!(key in DEFAULTS)) throw badRequest(`مفتاح غير معروف: ${key}`);
      if (typeof value !== 'string' || value.length > 2000) {
        throw badRequest(`قيمة غير صالحة لـ ${key}`);
      }
      if (value === String(DEFAULTS[key])) {
        await query('DELETE FROM site_content WHERE key = $1', [key]);
      } else {
        await query(
          `INSERT INTO site_content (key, value, updated_at) VALUES ($1,$2,NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, value]
        );
      }
    }
    invalidate();
    res.json({ ok: true });
  })
);

router.get(
  '/topups',
  asyncRoute(async (req, res) => {
    const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status)
      ? req.query.status
      : 'PENDING';
    const { rows } = await query(
      `SELECT t.*, s.name AS seller_name, s.phone AS seller_phone
         FROM topup_requests t JOIN sellers s ON s.id = t.seller_id
        WHERE t.status = $1
        ORDER BY t.created_at DESC LIMIT 200`,
      [status]
    );
    res.json({ topups: rows });
  })
);

router.patch(
  '/topups/:id',
  asyncRoute(async (req, res) => {
    const { status } = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM topup_requests WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!rows.length) throw notFound('طلب الشحن مو موجود');
      const topup = rows[0];
      if (topup.status !== 'PENDING') throw conflict('هاد الطلب انراجع قبل هيك');

      await client.query(
        'UPDATE topup_requests SET status = $1, reviewed_at = NOW() WHERE id = $2',
        [status, topup.id]
      );
      // Only an approval moves real money onto the balance -- a rejection
      // (wrong amount, no matching transfer found) leaves the ledger
      // untouched, exactly as if the request had never been made.
      if (status === 'APPROVED') {
        await credit(client, topup.seller_id, Number(topup.amount_minor), 'TOPUP', topup.id);
      }
      return { ok: true };
    });

    res.json(result);
  })
);

router.get(
  '/ads',
  asyncRoute(async (req, res) => {
    const { rows } = await query('SELECT * FROM ads ORDER BY sort_order, created_at DESC');
    res.json({ ads: rows });
  })
);

const adSchema = z.object({
  title: z.string().trim().min(2).max(120),
  imageUrl: z.string().url(),
  targetUrl: z.string().url(),
  placement: z.string().trim().min(2).max(60).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

router.post(
  '/ads',
  asyncRoute(async (req, res) => {
    const body = adSchema.parse(req.body);
    const id = makeId('ad');
    await query(
      `INSERT INTO ads (id, placement, title, image_url, target_url, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, body.placement || 'home_banner', body.title, body.imageUrl, body.targetUrl, body.sortOrder || 0]
    );
    res.status(201).json({ id });
  })
);

router.patch(
  '/ads/:id',
  asyncRoute(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    await query('UPDATE ads SET is_active = $1 WHERE id = $2', [isActive, req.params.id]);
    res.json({ ok: true });
  })
);

router.delete(
  '/ads/:id',
  asyncRoute(async (req, res) => {
    await query('DELETE FROM ads WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/reports',
  asyncRoute(async (req, res) => {
    const status = ['PENDING', 'RESOLVED', 'DISMISSED'].includes(req.query.status)
      ? req.query.status
      : 'PENDING';
    const { rows } = await query(
      `SELECT r.*, l.title AS listing_title, l.status AS listing_status
         FROM reports r JOIN listings l ON l.id = r.listing_id
        WHERE r.status = $1
        ORDER BY r.created_at DESC LIMIT 200`,
      [status]
    );
    res.json({ reports: rows });
  })
);

router.patch(
  '/reports/:id',
  asyncRoute(async (req, res) => {
    const { status } = z.object({ status: z.enum(['RESOLVED', 'DISMISSED']) }).parse(req.body);
    await query('UPDATE reports SET status = $1, reviewed_at = NOW() WHERE id = $2', [status, req.params.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/tickets',
  asyncRoute(async (req, res) => {
    const status = req.query.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
    const { rows } = await query(
      `SELECT * FROM support_tickets WHERE status = $1 ORDER BY created_at DESC LIMIT 200`,
      [status]
    );
    res.json({ tickets: rows });
  })
);

router.patch(
  '/tickets/:id',
  asyncRoute(async (req, res) => {
    const { status } = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).parse(req.body);
    await query('UPDATE support_tickets SET status = $1, reviewed_at = NOW() WHERE id = $2', [status, req.params.id]);
    res.json({ ok: true });
  })
);

module.exports = { router };
