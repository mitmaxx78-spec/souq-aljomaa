'use strict';

const fs = require('fs');
const path = require('path');
const { query } = require('./db');
const { merge, render } = require('./content');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

let cache = null; // rendered-page cache, keyed by filename; cleared on content save

async function loadContent() {
  const { rows } = await query('SELECT key, value FROM site_content');
  const overrides = {};
  for (const r of rows) overrides[r.key] = r.value;
  return merge(overrides);
}

function page(file) {
  return async (req, res, next) => {
    try {
      if (cache && cache[file]) return res.type('html').send(cache[file]);
      const raw = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
      const values = await loadContent();
      const html = render(raw, values);
      cache = cache || {};
      cache[file] = html;
      res.type('html').send(html);
    } catch (err) {
      next(err);
    }
  };
}

function staticPage(file) {
  return (req, res) => res.sendFile(path.join(PUBLIC_DIR, file));
}

function invalidate() {
  cache = null;
}

module.exports = { page, staticPage, invalidate, loadContent, PUBLIC_DIR };
