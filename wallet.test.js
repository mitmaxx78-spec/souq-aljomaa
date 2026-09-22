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
process.env.TOPUP_LIMIT_PER_HOUR = '100000';
process.env.FEATURE_COST_MINOR = '5000';
process.env.FEATURE_DAYS = '3';

const { start } = require('../src/server');
const { query, close } = require('../src/lib/db');

let server;
let base;

test.before(async () => {
  await query('TRUNCATE wallet_ledger, topup_requests, ads, bids, listing_images, listings, sellers, site_content RESTART IDENTITY CASCADE');
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

async function createApprovedFixedListing(phone) {
  const created = await post('/api/listings', {
    sellerName: 'بائع', phone, category: 'أخرى',
    title: 'غرض للبيع', description: 'وصف الغرض', area: 'دمشق',
    kind: 'FIXED', priceMinor: 100000,
  });
  await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);
  return created.body; // { id, sellerId, status }
}

test('a fresh seller starts with a zero balance', async () => {
  const listing = await createApprovedFixedListing('0921000001');
  const me = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.seller.balance_minor, '0');
});

test('a pending topup does not touch the balance; approving it does', async () => {
  const listing = await createApprovedFixedListing('0921000002');
  const topup = await post('/api/wallet/topups', {
    sellerId: listing.sellerId, amountMinor: 20000, method: 'SHAM_CASH', referenceNote: 'ref-1',
  });
  assert.equal(topup.status, 201);

  const beforeApproval = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(beforeApproval.body.seller.balance_minor, '0');

  const approve = await patch(`/api/admin/topups/${topup.body.id}`, { status: 'APPROVED' }, adminHeaders);
  assert.equal(approve.status, 200);

  const afterApproval = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(afterApproval.body.seller.balance_minor, '20000');
});

test('a rejected topup never credits the balance', async () => {
  const listing = await createApprovedFixedListing('0921000003');
  const topup = await post('/api/wallet/topups', {
    sellerId: listing.sellerId, amountMinor: 15000, method: 'BANK_TRANSFER',
  });
  await patch(`/api/admin/topups/${topup.body.id}`, { status: 'REJECTED' }, adminHeaders);
  const me = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(me.body.seller.balance_minor, '0');
});

test('a topup cannot be reviewed twice', async () => {
  const listing = await createApprovedFixedListing('0921000004');
  const topup = await post('/api/wallet/topups', {
    sellerId: listing.sellerId, amountMinor: 10000, method: 'OTHER',
  });
  const first = await patch(`/api/admin/topups/${topup.body.id}`, { status: 'APPROVED' }, adminHeaders);
  assert.equal(first.status, 200);
  const second = await patch(`/api/admin/topups/${topup.body.id}`, { status: 'APPROVED' }, adminHeaders);
  assert.equal(second.status, 409);

  const me = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(me.body.seller.balance_minor, '10000'); // not double-credited
});

test('featuring a listing fails without enough balance, succeeds once topped up', async () => {
  const listing = await createApprovedFixedListing('0921000005');

  const poorAttempt = await post(`/api/wallet/listings/${listing.id}/feature`, { sellerId: listing.sellerId });
  assert.equal(poorAttempt.status, 409);

  const topup = await post('/api/wallet/topups', {
    sellerId: listing.sellerId, amountMinor: 5000, method: 'SHAM_CASH',
  });
  await patch(`/api/admin/topups/${topup.body.id}`, { status: 'APPROVED' }, adminHeaders);

  const richAttempt = await post(`/api/wallet/listings/${listing.id}/feature`, { sellerId: listing.sellerId });
  assert.equal(richAttempt.status, 200);

  const me = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(me.body.seller.balance_minor, '0'); // spent exactly what it cost

  const publicList = await get('/api/listings?kind=FIXED');
  const found = publicList.body.listings.find((l) => l.id === listing.id);
  assert.equal(found.is_featured, true);
});

test('featuring someone else\'s listing is refused', async () => {
  const mine = await createApprovedFixedListing('0921000006');
  const someoneElse = await createApprovedFixedListing('0921000007');
  const res = await post(`/api/wallet/listings/${someoneElse.id}/feature`, { sellerId: mine.sellerId });
  assert.equal(res.status, 400);
});

test('two simultaneous feature purchases never both succeed off one balance', async () => {
  const listing = await createApprovedFixedListing('0921000008');
  const topup = await post('/api/wallet/topups', {
    sellerId: listing.sellerId, amountMinor: 5000, method: 'SHAM_CASH',
  });
  await patch(`/api/admin/topups/${topup.body.id}`, { status: 'APPROVED' }, adminHeaders);

  // Only enough balance for one feature purchase (5000). A second listing to
  // feature concurrently against the same seller balance.
  const created2 = await post('/api/listings', {
    sellerName: 'بائع', phone: '0921000008', category: 'أخرى',
    title: 'غرض ثاني', description: 'وصف الغرض الثاني', area: 'دمشق', kind: 'FIXED', priceMinor: 50000,
  });
  await patch(`/api/admin/listings/${created2.body.id}`, { status: 'APPROVED' }, adminHeaders);

  const [a, b] = await Promise.all([
    post(`/api/wallet/listings/${listing.id}/feature`, { sellerId: listing.sellerId }),
    post(`/api/wallet/listings/${created2.body.id}/feature`, { sellerId: listing.sellerId }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  const me = await get(`/api/wallet/me/${listing.sellerId}`);
  assert.equal(me.body.seller.balance_minor, '0');
});

test('admin can add, list, toggle, and delete an ad banner; public sees only active ones', async () => {
  const created = await post(
    '/api/admin/ads',
    { title: 'إعلان تجريبي', imageUrl: 'https://example.com/a.png', targetUrl: 'https://example.com' },
    adminHeaders
  );
  assert.equal(created.status, 201);

  const publicBefore = await get('/api/ads?placement=home_banner');
  assert.ok(publicBefore.body.ads.some((a) => a.id === created.body.id));

  await patch(`/api/admin/ads/${created.body.id}`, { isActive: false }, adminHeaders);
  const publicAfter = await get('/api/ads?placement=home_banner');
  assert.ok(!publicAfter.body.ads.some((a) => a.id === created.body.id));

  const del = await fetch(base + `/api/admin/ads/${created.body.id}`, { method: 'DELETE', headers: adminHeaders });
  assert.equal(del.status, 200);
});

test('ads endpoints require the admin key', async () => {
  const res = await post('/api/admin/ads', { title: 'x', imageUrl: 'https://a.com/a.png', targetUrl: 'https://a.com' });
  assert.equal(res.status, 403);
});
