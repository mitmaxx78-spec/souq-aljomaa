'use strict';

const { makeId } = require('./ids');

const FEATURE_COST_MINOR = Number(process.env.FEATURE_COST_MINOR) || 5000; // 5,000 SYP
const FEATURE_DAYS = Number(process.env.FEATURE_DAYS) || 3;

// Writes a ledger row and moves the balance in the same statement set, inside
// whatever transaction the caller already opened. Never called with the
// balance read outside a transaction -- see spend() below for why.
async function credit(client, sellerId, amountMinor, reason, refId) {
  await client.query(
    'INSERT INTO wallet_ledger (id, seller_id, amount_minor, reason, ref_id) VALUES ($1,$2,$3,$4,$5)',
    [makeId('wl'), sellerId, amountMinor, reason, refId || null]
  );
  await client.query('UPDATE sellers SET balance_minor = balance_minor + $1 WHERE id = $2', [
    amountMinor,
    sellerId,
  ]);
}

// Deducts only if the balance covers it, checked with a row lock inside the
// same transaction -- otherwise two "feature this listing" clicks fired at
// the same instant could both read a balance of 5,000, both decide they can
// afford a 5,000 perk, and leave the seller at -5,000.
async function spend(client, sellerId, amountMinor, reason, refId) {
  const { rows } = await client.query(
    'SELECT balance_minor FROM sellers WHERE id = $1 FOR UPDATE',
    [sellerId]
  );
  if (!rows.length) throw new Error('seller not found');
  if (Number(rows[0].balance_minor) < amountMinor) {
    return false;
  }
  await credit(client, sellerId, -amountMinor, reason, refId);
  return true;
}

module.exports = { credit, spend, FEATURE_COST_MINOR, FEATURE_DAYS };
