'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { db }           = require('../db');
const { PROJECT_ROOT } = require('../helpers');
const { publicReadRateLimit } = require('../middleware/rate-limits');

const router = express.Router();
const HOMEPAGE_DISCLOSURE = 'WV Real Estate Agency, LLC | Sheila Judy, Broker | 501 East Main Street, Romney, WV 26757 | (540) 246-1421';

function replaceHomepageContent(html, search, replacement) {
  if (!html.includes(search)) {
    throw new Error(`Homepage disclosure insertion point missing: ${search.slice(0, 48)}`);
  }
  return html.replace(search, replacement);
}

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

router.get('/', publicReadRateLimit, (_req, res, next) => {
  try {
    const indexHtml = path.join(PROJECT_ROOT, 'app', 'index.html');
    let html = fs.readFileSync(indexHtml, 'utf8');

    html = replaceHomepageContent(
      html,
      '    "name": "MalickLand",',
      '    "name": "WV Real Estate Agency, LLC",\n    "alternateName": "MalickLand",'
    );
    html = replaceHomepageContent(
      html,
      '      "addressLocality": "Romney",',
      '      "streetAddress": "501 East Main Street",\n      "addressLocality": "Romney",'
    );
    html = replaceHomepageContent(
      html,
      '    <p class="hero-sub">Land, homes, farms &amp; rural retreats across all 55 WV counties. AI-powered pricing, local expertise, fast response.</p>',
      `    <p class="hero-sub">Land, homes, farms &amp; rural retreats across all 55 WV counties. AI-powered pricing, local expertise, fast response.</p>\n    <p aria-label="Brokerage disclosure" style="font-size:.82rem;color:rgba(255,255,255,.88);margin:-1.75rem 0 2rem;max-width:640px;line-height:1.55;">${HOMEPAGE_DISCLOSURE}</p>`
    );
    html = replaceHomepageContent(
      html,
      'Licensed in West Virginia<br/>Broker: Sheila Judy<br/>Romney, West Virginia',
      'Licensed in West Virginia<br/>WV Real Estate Agency, LLC<br/>Sheila Judy, Broker<br/>501 East Main Street, Romney, WV 26757<br/>(540) 246-1421'
    );
    html = replaceHomepageContent(
      html,
      'MalickLand WV Real Estate | Phil Malick, Agent | Broker: Sheila Judy | <a href="tel:+15402461421">(540) 246-1421</a> | <a href="mailto:phil@malickland.net">phil@malickland.net</a> | Licensed in West Virginia',
      'MalickLand | Phil Malick, Agent | WV Real Estate Agency, LLC | Sheila Judy, Broker | 501 East Main Street, Romney, WV 26757 | <a href="tel:+15402461421">(540) 246-1421</a> | <a href="mailto:phil@malickland.net">phil@malickland.net</a> | Licensed in West Virginia'
    );

    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
});

router.get(['/listing/:id', '/properties/:id'], publicReadRateLimit, (_req, res) => {
  const listingHtml = path.join(PROJECT_ROOT, 'app', 'listing.html');
  const indexHtml   = path.join(PROJECT_ROOT, 'app', 'index.html');
  res.sendFile(fs.existsSync(listingHtml) ? listingHtml : indexHtml);
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