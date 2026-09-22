'use strict';

const { query } = require('./db');

// Auctions end by the clock, not by anyone clicking a button. Without this a
// listing could sit "APPROVED" forever after its countdown hits zero, still
// showing up in the browse list as if bidding were open (the /api/listings
// and /api/.../bids routes both re-check ends_at defensively too, so a missed
// sweep tick never lets a bid land after the deadline -- this just keeps the
// stored status honest for anyone reading it directly, e.g. from /admin).
async function sweepEndedAuctions() {
  const { rowCount } = await query(
    `UPDATE listings SET status = 'ENDED'
      WHERE kind = 'AUCTION' AND status = 'APPROVED' AND ends_at <= NOW()`
  );
  if (rowCount) console.log(`[souq] closed ${rowCount} ended auction(s)`);
  return rowCount;
}

module.exports = { sweepEndedAuctions };
