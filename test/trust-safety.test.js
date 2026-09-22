'use strict';

require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');

const dbUrl = process.env.DATABASE_URL || '';
const looksDisposable = /test/i.test(dbUrl) || process.env.ALLOW_DESTRUCTIVE_TESTS === 'yes-i-am-sure';
if (!looksDisposable) {
  throw new Error(`Refusing to run tests: DATABASE_URL does not look like a test database (${dbUrl}).`);
}

process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';
process.env.RATE_LIMIT_PER_MINUTE = '100000';
process.env.LISTING_LIMIT_PER_HOUR = '100000';
process.env.REPORT_LIMIT_PER_HOUR = '100000';
process.env.SUPPORT_LIMIT_PER_HOUR = '100000';

const { start } = require('../src/server');
const { query, close } = require('../src/lib/db');

let server;
let base;

test.before(async () => {
  await query('TRUNCATE support_tickets, reports, wallet_ledger, topup_requests, ads, bids, listing_images, listings, sellers, site_content RESTART IDENTITY CASCADE');
  server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await close();
});

const adminHeaders = { 'x-admin-key': 'test-admin-key' };

async function post(path, body, headers) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
async function get(path, headers) {
  const res = await fetch(base + path, { headers });
  return { status: res.status, body: await res.json() };
}
async function patch(path, body, headers) {
  const res = await fetch(base + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('a listing naming a blocked term is refused outright and never stored', async () => {
  const res = await post('/api/listings', {
    sellerName: 'شخص', phone: '0931000001', category: 'أخرى',
    title: 'مسدس للبيع حالة ممتازة', description: 'وصف كافي للإعلان', area: 'دمشق',
    kind: 'FIXED', priceMinor: 500000,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details.reason, 'BLOCKED_CONTENT');

  const found = await query('SELECT 1 FROM listings WHERE title LIKE $1', ['%مسدس%']);
  assert.equal(found.rowCount, 0);
});

test('a listing naming a softer flagged term is still created, marked flagged, and stays PENDING', async () => {
  const res = await post('/api/listings', {
    sellerName: 'شخص', phone: '0931000002', category: 'أخرى',
    title: 'جواز سفر قديم للتحف', description: 'قطعة تراثية للهواة', area: 'حلب',
    kind: 'FIXED', priceMinor: 20000,
  });
  assert.equal(res.status, 201);

  const row = await query('SELECT is_flagged, status FROM listings WHERE id = $1', [res.body.id]);
  assert.equal(row.rows[0].is_flagged, true);
  assert.equal(row.rows[0].status, 'PENDING');
});

test('an ordinary listing is not flagged', async () => {
  const res = await post('/api/listings', {
    sellerName: 'شخص', phone: '0931000003', category: 'أخرى',
    title: 'طاولة خشب للبيع', description: 'طاولة استعمال خفيف بحالة منيحة', area: 'دمشق',
    kind: 'FIXED', priceMinor: 30000,
  });
  const row = await query('SELECT is_flagged FROM listings WHERE id = $1', [res.body.id]);
  assert.equal(row.rows[0].is_flagged, false);
});

test('reporting a listing creates a pending report an admin can resolve', async () => {
  const created = await post('/api/listings', {
    sellerName: 'شخص', phone: '0931000004', category: 'أخرى',
    title: 'غرض للبيع', description: 'وصف الغرض هون', area: 'دمشق', kind: 'FIXED', priceMinor: 10000,
  });
  await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);

  const report = await post(`/api/listings/${created.body.id}/reports`, {
    reason: 'SCAM', note: 'الصور مو حقيقية',
  });
  assert.equal(report.status, 201);

  const pending = await get('/api/admin/reports?status=PENDING', adminHeaders);
  assert.ok(pending.body.reports.some((r) => r.id === report.body.id));

  const resolve = await patch(`/api/admin/reports/${report.body.id}`, { status: 'RESOLVED' }, adminHeaders);
  assert.equal(resolve.status, 200);

  const stillPending = await get('/api/admin/reports?status=PENDING', adminHeaders);
  assert.ok(!stillPending.body.reports.some((r) => r.id === report.body.id));
});

test('reporting a listing that does not exist is refused', async () => {
  const res = await post('/api/listings/lst_doesnotexist/reports', { reason: 'OTHER' });
  assert.equal(res.status, 404);
});

test('a support ticket rejects a too-short phone, accepts a valid one, and is closable by admin', async () => {
  const bad = await post('/api/support', { phone: '123', topic: 'QUESTION', message: 'شو هالموقع' });
  assert.equal(bad.status, 400);

  const good = await post('/api/support', { phone: '0991234567', topic: 'DISPUTE', message: 'البايع ما رد علي' });
  assert.equal(good.status, 201);

  const open = await get('/api/admin/tickets?status=OPEN', adminHeaders);
  assert.ok(open.body.tickets.some((t) => t.id === good.body.id));

  const close = await patch(`/api/admin/tickets/${good.body.id}`, { status: 'CLOSED' }, adminHeaders);
  assert.equal(close.status, 200);
});

test('the public site-content endpoint exposes the help widget text', async () => {
  const res = await get('/api/site-content');
  assert.equal(res.status, 200);
  assert.ok(res.body.help_title);
  assert.ok(res.body.faq1_q);
});
