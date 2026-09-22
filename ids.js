'use strict';

const crypto = require('crypto');

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

module.exports = { makeId };
