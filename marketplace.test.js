'use strict';

require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');

// Refuses to run against anything that isn't clearly a disposable database.
// The wallet project's test suite once TRUNCATEd its tables at start-up with
// no such guard -- a stray production DATABASE_URL would have wiped real
// customer data. Same class of mistake is easy to repeat here, so the guard
// comes first, before any other module (including ./lib/db) touches the URL.
const dbUrl = process.env.DATABASE_URL || '';
const looksDisposable = /test/i.test(dbUrl) || process.env.ALLOW_DESTRUCTIVE_TESTS === 'yes-i-am-sure';
if (!looksDisposable) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not look like a test database (${dbUrl}). ` +
    `Point it at a database with "test" in the name, or set ALLOW_DESTRUCTIVE_TESTS=yes-i-am-sure.`
  );
}

process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';
process.env.RATE_LIMIT_PER_MINUTE = '100000';
process.env.LISTING_LIMIT_PER_HOUR = '100000';
process.env.BID_LIMIT_PER_MINUTE = '100000';

const { app, start } = require('../src/server');
const { query, close } = require('../src/lib/db');

let server;
let base;

test.before(async () => {
  await query('TRUNCATE bids, listing_images, listings, sellers, site_content RESTART IDENTITY CASCADE');
  server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await close();
});

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

const adminHeaders = { 'x-admin-key': 'test-admin-key' };

function fixedPayload(overrides) {
  return {
    sellerName: 'أحمد', phone: '0991000001', category: 'إلكترونيات',
    title: 'تلفزيون سامسونج', description: 'شغال منيح', area: 'دمشق',
    kind: 'FIXED', priceMinor: 500000, ...overrides,
  };
}
function auctionPayload(overrides) {
  return {
    sellerName: 'سارة', phone: '0991000002', category: 'سيارات',
    title: 'دراجة', description: 'شبه جديدة', area: 'حلب',
    kind: 'AUCTION', startingPriceMinor: 10000, durationHours: 1, ...overrides,
  };
}

test('rejects a listing with a too-short phone number', async () => {
  const res = await post('/api/listings', fixedPayload({ phone: '123' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details.field, 'phone');
});

test('rejects a fixed listing missing a price', async () => {
  const res = await post('/api/listings', fixedPayload({ priceMinor: undefined }));
  assert.equal(res.status, 400);
});

test('honeypot drops the submission but returns 201', async () => {
  const res = await post('/api/listings', fixedPayload({ website: 'http://bot.example' }));
  assert.equal(res.status, 201);
  const stored = await query('SELECT 1 FROM listings WHERE id = $1', [res.body.id]);
  assert.equal(stored.rowCount, 0);
});

test('a pending listing does not show up publicly, an approved one does', async () => {
  const created = await post('/api/listings', fixedPayload({ phone: '0991000010' }));
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'PENDING');

  const beforeApproval = await get('/api/listings?kind=FIXED');
  assert.ok(!beforeApproval.body.listings.some((l) => l.id === created.body.id));

  const approve = await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);
  assert.equal(approve.status, 200);

  const afterApproval = await get('/api/listings?kind=FIXED');
  assert.ok(afterApproval.body.listings.some((l) => l.id === created.body.id));
});

test('admin routes reject a missing or wrong key', async () => {
  const noKey = await get('/api/admin/listings');
  assert.equal(noKey.status, 403);
  const wrongKey = await get('/api/admin/listings', { 'x-admin-key': 'nope' });
  assert.equal(wrongKey.status, 403);
});

test('bidding: accepts a bid above the minimum increment, rejects one below it', async () => {
  const created = await post('/api/listings', auctionPayload({ phone: '0991000020' }));
  await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);

  const goodBid = await post(`/api/listings/${created.body.id}/bids`, {
    bidderName: 'خالد', phone: '0991000021', amountMinor: 15000,
  });
  assert.equal(goodBid.status, 201);

  const lowBid = await post(`/api/listings/${created.body.id}/bids`, {
    bidderName: 'ليلى', phone: '0991000022', amountMinor: 15200,
  });
  assert.equal(lowBid.status, 400);
  assert.equal(lowBid.body.error.details.minAllowed, 16000);

  const detail = await get(`/api/listings/${created.body.id}`);
  assert.equal(detail.body.listing.current_price_minor, '15000');
  assert.equal(detail.body.listing.bid_count, 1);
  assert.equal(detail.body.bids.length, 1);
});

test('bidding: two concurrent bids never both "win" -- one is rejected as too low', async () => {
  const created = await post('/api/listings', auctionPayload({ phone: '0991000030', startingPriceMinor: 20000 }));
  await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);

  const bidBody = { bidderName: 'متزايد', phone: '0991000031', amountMinor: 25000 };
  const [a, b] = await Promise.all([
    post(`/api/listings/${created.body.id}/bids`, bidBody),
    post(`/api/listings/${created.body.id}/bids`, bidBody),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 400]);

  const detail = await get(`/api/listings/${created.body.id}`);
  assert.equal(detail.body.listing.bid_count, 1);
});

test('bidding is refused on an ended auction', async () => {
  const created = await post('/api/listings', auctionPayload({ phone: '0991000040', durationHours: 1 }));
  await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);
  await query(`UPDATE listings SET ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [created.body.id]);

  const res = await post(`/api/listings/${created.body.id}/bids`, {
    bidderName: 'متأخر', phone: '0991000041', amountMinor: 99999,
  });
  assert.equal(res.status, 409);
});

test('bidding rejects on a listing that is not an auction', async () => {
  const created = await post('/api/listings', fixedPayload({ phone: '0991000050' }));
  await patch(`/api/admin/listings/${created.body.id}`, { status: 'APPROVED' }, adminHeaders);
  const res = await post(`/api/listings/${created.body.id}/bids`, {
    bidderName: 'مستعجل', phone: '0991000051', amountMinor: 999999,
  });
  assert.equal(res.status, 400);
});

test('content editor: saving and resetting to default', async () => {
  const before = await get('/api/admin/content', adminHeaders);
  assert.equal(before.status, 200);

  const put = await fetch(base + '/api/admin/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminHeaders },
    body: JSON.stringify({ hero_title: 'عنوان تجربة' }),
  });
  assert.equal(put.status, 200);

  const home = await fetch(base + '/');
  const html = await home.text();
  assert.ok(html.includes('عنوان تجربة'));

  const reset = await fetch(base + '/api/admin/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminHeaders },
    body: JSON.stringify({ hero_title: 'سوق الجمعة' }),
  });
  assert.equal(reset.status, 200);
});

test('a fake key on the content endpoint is rejected', async () => {
  const res = await get('/api/admin/content', { 'x-admin-key': 'nope' });
  assert.equal(res.status, 403);
});
