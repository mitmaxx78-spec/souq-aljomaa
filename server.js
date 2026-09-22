'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { query, close } = require('./lib/db');
const { errorHandler, asyncRoute } = require('./lib/errors');
const { page, staticPage, loadContent, PUBLIC_DIR } = require('./lib/pages');
const { sweepEndedAuctions } = require('./lib/sweep');

const { router: listingsRouter } = require('./routes/listings');
const { router: bidsRouter } = require('./routes/bids');
const { router: adminRouter } = require('./routes/admin');
const { router: walletRouter } = require('./routes/wallet');
const { router: adsRouter } = require('./routes/ads');
const { router: reportsRouter } = require('./routes/reports');
const { router: supportRouter } = require('./routes/support');

const app = express();

app.set('trust proxy', 1);
app.use(
  helmet({
    // The pin-drop map (Leaflet, vendored under /vendor/leaflet -- no
    // external script host to worry about) pulls its map tiles as plain
    // <img> requests from OpenStreetMap's tile servers, so img-src needs
    // those hosts added on top of helmet's 'self' default.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      },
    },
  })
);
app.use(express.json({ limit: '256kb' }));

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'كتير طلبات، تمهل شوي' } },
  })
);

app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', service: 'souq-aljomaa', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', service: 'souq-aljomaa', database: 'unreachable', time: new Date().toISOString() });
  }
});

app.get(['/admin', '/admin/'], staticPage('admin.html'));
app.get(['/sell', '/sell/'], page('sell.html'));
app.get(['/auctions', '/auctions/'], page('auctions.html'));
app.get(['/listing', '/listing/'], page('listing.html'));
app.get(['/me', '/me/'], page('me.html'));
app.get(['/privacy', '/privacy/'], staticPage('privacy.html'));
app.get(['/impressum', '/impressum/'], staticPage('impressum.html'));
app.get('/', page('index.html'));

app.use('/api/listings', listingsRouter);
app.use('/api/listings', bidsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/ads', adsRouter);
app.use('/api/listings', reportsRouter);
app.use('/api/support', supportRouter);

// The same values every page already inlines into its HTML via {{markers}} --
// nothing secret here, so a small floating widget (loaded once via widget.js
// on every page, rather than re-templated per page) can fetch its own copy
// to render the help panel and FAQ text.
app.get(
  '/api/site-content',
  asyncRoute(async (req, res) => {
    res.json(await loadContent());
  })
);

// Static pages + every publicly-visible listing (approved, not yet ended),
// so search engines find individual ads too, not just the four top-level
// pages. Admin, legal and the /me dashboard stay out on purpose -- nothing
// there is meant to rank.
app.get(
  '/sitemap.xml',
  asyncRoute(async (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    const staticUrls = ['/', '/auctions', '/sell'];
    const { rows } = await query(
      `SELECT id, created_at FROM listings WHERE status = 'APPROVED' ORDER BY created_at DESC LIMIT 5000`
    );
    const urlTags = [
      ...staticUrls.map((p) => `<url><loc>${base}${p}</loc></url>`),
      ...rows.map(
        (r) => `<url><loc>${base}/listing?id=${encodeURIComponent(r.id)}</loc><lastmod>${r.created_at.toISOString().slice(0, 10)}</lastmod></url>`
      ),
    ];
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTags.join('\n')}\n</urlset>`
    );
  })
);

app.use((req, res, next) => {
  if (req.path.toLowerCase().endsWith('.html')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  }
  next();
});

app.use(
  '/',
  express.static(PUBLIC_DIR, {
    index: false,
    maxAge: '5m',
    setHeaders(res, filePath) {
      if (/\.(png|svg|ico|webp|jpg)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    },
  })
);

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

app.use(errorHandler);

function start(port = Number(process.env.PORT) || 3000) {
  const server = app.listen(port, () => {
    console.log(`[souq] listening on port ${server.address().port}`);
  });

  // Runs in the same process rather than a separate PM2 job -- one auction
  // sweep a minute is cheap enough that a second process and its own restart
  // policy would be pure overhead for what it does.
  const sweepInterval = setInterval(() => {
    sweepEndedAuctions().catch((err) => console.error('[souq] sweep failed', err));
  }, 60 * 1000);
  sweepInterval.unref();

  async function shutdown(signal) {
    console.log(`[souq] ${signal} received, shutting down`);
    server.close(async () => {
      await close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) start();

module.exports = { app, start };
