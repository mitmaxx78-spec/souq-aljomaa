'use strict';

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { query } = require('../lib/db');
const { makeId } = require('../lib/ids');
const { asyncRoute, badRequest } = require('../lib/errors');
const { normalizePhone, isCallable } = require('../lib/phone');

const router = express.Router();

const TOPICS = ['DISPUTE', 'QUESTION', 'COMPLAINT', 'OTHER'];

const ticketSchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(1).max(40),
  topic: z.enum(TOPICS),
  message: z.string().trim().min(5).max(2000),
});

const ticketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.SUPPORT_LIMIT_PER_HOUR) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'كتير رسائل بوقت قصير' } },
});

router.post(
  '/',
  ticketLimiter,
  asyncRoute(async (req, res) => {
    const body = ticketSchema.parse(req.body);
    const phone = normalizePhone(body.phone);
    if (!isCallable(phone)) {
      throw badRequest('رقم التلفون ناقص', { field: 'phone', reason: 'TOO_SHORT' });
    }
    const id = makeId('tkt');
    await query(
      `INSERT INTO support_tickets (id, name, phone, topic, message)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, body.name || null, phone, body.topic, body.message]
    );
    res.status(201).json({ id, status: 'OPEN' });
  })
);

module.exports = { router, TOPICS };
