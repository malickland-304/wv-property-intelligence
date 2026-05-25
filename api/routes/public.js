'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { db }           = require('../db');
const { PROJECT_ROOT } = require('../helpers');
const { publicReadRateLimit } = require('../middleware/rate-limits');

const router = express.Router();

router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: https://malickland.net/sitemap.xml`
  );
});

router.get('/sitemap.xml', publicReadRateLimit, (_req, res) => {
  const SITE = 'https://malickland.net';
  const now  = new Date().toISOString().split('T')[0];

  const staticPages = [
    { loc: SITE + '/',      changefreq: 'weekly', priority: '1.0' },
    { loc: SITE + '/admin', changefreq: 'never',  priority: '0.1' },
  ];

  let propertyPages = [];
  try {
    const props = db.prepare(
      "SELECT listing_slug, id, updated_at FROM properties WHERE status = 'active'"
    ).all();
    propertyPages = props.map(p => ({
      loc:        SITE + '/listing/' + (p.listing_slug || p.id),
      lastmod:    p.updated_at ? p.updated_at.slice(0,10) : now,
      changefreq: 'weekly',
      priority:   '0.8',
    }));
  } catch (_) {}

  const allPages = [...staticPages, ...propertyPages];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...allPages.map(p => [
      '  <url>',
      `    <loc>${p.loc}</loc>`,
      p.lastmod ? `    <lastmod>${p.lastmod}</lastmod>` : `    <lastmod>${now}</lastmod>`,
      `    <changefreq>${p.changefreq}</changefreq>`,
      `    <priority>${p.priority}</priority>`,
      '  </url>',
    ].join('\n')),
    '</urlset>',
  ].join('\n');

  res.type('application/xml').send(xml);
});

router.get('/listing/:id', publicReadRateLimit, (_req, res) => {
  const listingHtml = path.join(PROJECT_ROOT, 'app', 'listing.html');
  const indexHtml   = path.join(PROJECT_ROOT, 'app', 'index.html');
  res.sendFile(fs.existsSync(listingHtml) ? listingHtml : indexHtml);
});

router.get('/listings', publicReadRateLimit, (_req, res) => {
  const listingsHtml = path.join(PROJECT_ROOT, 'app', 'listings.html');
  const indexHtml    = path.join(PROJECT_ROOT, 'app', 'index.html');
  res.sendFile(fs.existsSync(listingsHtml) ? listingsHtml : indexHtml);
});

router.get('/37-advent', publicReadRateLimit, (_req, res) => {
  const adventHtml = path.join(PROJECT_ROOT, 'app', '37-advent.html');
  const indexHtml  = path.join(PROJECT_ROOT, 'app', 'index.html');
  res.sendFile(fs.existsSync(adventHtml) ? adventHtml : indexHtml);
});

router.get('/advent-drive-land-hampshire-county-wv', publicReadRateLimit, (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Land for Sale Hampshire County WV | Advent Dr</title>
  <meta name="description" content="Land for sale in Hampshire County WV on Advent Drive. Hunting, recreation, or build opportunity near VA/DC.">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": "Land for Sale – Advent Drive, Hampshire County WV",
    "description": "Land for sale in Hampshire County West Virginia on Advent Drive.",
    "url": "https://malickland.net/advent-drive-land-hampshire-county-wv"
  }
  </script>
</head>
<body>
  <h1>Land for Sale – Advent Drive, Hampshire County WV</h1>
  <p>This property offers privacy, usable acreage, and strong long-term value.</p>
  <p><strong>Contact now to walk the property.</strong></p>
  <a href="https://malickland.net">Back to MalickLand</a>
</body>
</html>`);
});

module.exports = router;
