'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

function query(text, params) {
  return pool.query(text, params);
}

// Runs a set of statements as one transaction. Bidding needs this: reading
// the current high bid and writing a new one must happen as a single atomic
// step, or two people bidding in the same second could both "win" the same
// listing.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = { query, withTransaction, close };
