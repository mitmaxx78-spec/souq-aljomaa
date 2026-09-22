'use strict';

const express = require('express');
const { query } = require('../lib/db');
const { asyncRoute } = require('../lib/errors');

const router = express.Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const placement = typeof req.query.placement === 'string' ? req.query.placement : 'home_banner';
    const { rows } = await query(
      `SELECT id, title, image_url, target_url
         FROM ads WHERE placement = $1 AND is_active = TRUE
        ORDER BY sort_order, created_at DESC LIMIT 10`,
      [placement]
    );
    res.json({ ads: rows });
  })
);

module.exports = { router };
