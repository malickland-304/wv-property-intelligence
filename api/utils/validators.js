'use strict';

const crypto = require('crypto');

const ADVENT_LISTING_SLUG = '37-advent';
const ADVENT_PROPERTY_ADDRESS = '37 Advent Dr, Augusta, WV 26704';
const DEFAULT_SITE_URL = 'https://malickland.net';

const LEAD_TYPES = new Set(['property_packet', 'request_showing', 'similar_land_alert']);
const LEAD_TYPE_LABELS = {
  property_packet: 'Property Packet',
  request_showing: 'Request Showing',
  similar_land_alert: 'Similar Land Alert',
};

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoDate(input) {
  return new Date(input).toISOString();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizePhone(value) {
  const raw = cleanString(value);
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function normalizeLeadType(value) {
  const raw = cleanString(value).toLowerCase();
  if (LEAD_TYPES.has(raw)) return raw;
  return 'property_packet';
}

function leadTypeLabel(value) {
  return LEAD_TYPE_LABELS[value] || LEAD_TYPE_LABELS.property_packet;
}

function formatPropertyAddress(property = {}) {
  const parts = [
    property.address,
    property.city,
    property.county ? `${property.county} County` : '',
    property.state || 'WV',
    property.zip,
  ].filter(Boolean);

  return parts.join(', ');
}

function isValidEmail(value) {
  if (!value) return true;
  const at = value.indexOf('@');
  if (at < 1 || value.indexOf('@', at + 1) !== -1) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

function sanitizeLeadPayload(payload = {}) {
  return {
    name: cleanString(payload.name),
    phone: normalizePhone(payload.phone),
    email: cleanString(payload.email).toLowerCase(),
    leadType: normalizeLeadType(payload.leadType || payload.lead_type),
    buyerType: cleanString(payload.buyerType || payload.buyer_type || payload.intent),
    cashOrFinancing: cleanString(payload.cashOrFinancing || payload.financingType || payload.financing_type),
    timeline: cleanString(payload.timeline),
    message: cleanString(payload.message),
    smsConsent: parseBoolean(payload.smsConsent),
    source: cleanString(payload.source),
    utm_source: cleanString(payload.utm_source),
    utm_medium: cleanString(payload.utm_medium),
    utm_campaign: cleanString(payload.utm_campaign),
  };
}

function validateLeadPayload(payload, { requireEmail = true, requirePhone = true } = {}) {
  const errors = [];

  if (!payload.name) errors.push('Name is required.');
  if (requirePhone && !payload.phone) errors.push('Phone is required.');
  if (requireEmail && !payload.email) errors.push('Email is required.');
  if (!payload.buyerType) errors.push('Buyer type is required.');
  if (!payload.cashOrFinancing) errors.push('Cash or financing is required.');
  if (!payload.leadType) errors.push('Lead type is required.');
  if (payload.email && !isValidEmail(payload.email)) errors.push('Invalid email address.');

  return errors;
}

function buildLeadSchedule(lead, siteUrl = DEFAULT_SITE_URL) {
  const createdAt = new Date(lead.created_at || new Date().toISOString());
  const propertyUrl = lead.property_slug
    ? `${siteUrl.replace(/\/$/, '')}/properties/${lead.property_slug}`
    : siteUrl.replace(/\/$/, '');
  const leadTypeName = leadTypeLabel(lead.lead_type).toLowerCase();

  return [
    {
      step_code: 'day_0',
      channel: 'email',
      template_name: 'instant_property_reply',
      due_at: toIsoDate(createdAt),
      subject: `${lead.property_address}: next steps from Phil Malick`,
      body: [
        `Hi ${lead.name},`,
        '',
        `Thanks for requesting ${leadTypeName} details for ${lead.property_address}.`,
        '',
        "Phil will follow up with the property details, maps, and access guidance. If you'd like to walk it sooner, just reply to this email with the best day and time.",
        '',
        `Property page: ${propertyUrl}`,
        '',
        'Best,',
        'Phil Malick',
        'MalickLand',
      ].join('\n'),
    },
    {
      step_code: 'day_1',
      channel: 'email',
      template_name: 'follow_up_access',
      due_at: toIsoDate(addDays(createdAt, 1)),
      subject: `Still interested in ${lead.property_address}?`,
      body: [
        `Hi ${lead.name},`,
        '',
        `Quick follow-up on ${lead.property_address}.`,
        '',
        "If you want access details, map pins, or to set up a walk-through, reply here and Phil can line that up.",
        '',
        `Property page: ${propertyUrl}`,
        '',
        'Best,',
        'Phil Malick',
      ].join('\n'),
    },
    {
      step_code: 'day_3',
      channel: 'email',
      template_name: 'follow_up_similar_land',
      due_at: toIsoDate(addDays(createdAt, 3)),
      subject: `Want similar West Virginia land options too?`,
      body: [
        `Hi ${lead.name},`,
        '',
        `If ${lead.property_address} is close but not perfect, Phil can send similar West Virginia land options that match your timeline and budget.`,
        '',
        `Reply with what you're looking for and we'll narrow it down.`,
        '',
        'Best,',
        'Phil Malick',
      ].join('\n'),
    },
  ];
}

function buildPropertyLead(payload, property = {}) {
  const createdAt = new Date().toISOString();
  const lead = {
    lead_id: crypto.randomBytes(12).toString('hex'),
    timestamp: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    property_id: property.id || null,
    property_slug: property.listing_slug || property.id || '',
    listing_slug: property.listing_slug || property.id || '',
    property_address: formatPropertyAddress(property) || ADVENT_PROPERTY_ADDRESS,
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    lead_type: payload.leadType,
    buyer_type: payload.buyerType,
    buyer_intent: payload.buyerType,
    cash_or_financing: payload.cashOrFinancing,
    financing_type: payload.cashOrFinancing,
    timeline: payload.timeline,
    message: payload.message,
    sms_consent: payload.smsConsent ? 1 : 0,
    source: payload.source || `property-${payload.leadType}`,
    utm_source: payload.utm_source,
    utm_medium: payload.utm_medium,
    utm_campaign: payload.utm_campaign,
    status: 'new',
    follow_up_status: 'scheduled',
    next_follow_up_at: '',
  };

  const schedule = buildLeadSchedule(lead);
  // Track the first pending follow-up; the immediate step only advances after it is actually sent.
  lead.next_follow_up_at = schedule[0]?.due_at || lead.created_at;

  return lead;
}

function build37AdventLead(payload) {
  return buildPropertyLead(payload, {
    id: null,
    address: '37 Advent Dr',
    city: 'Augusta',
    county: 'Hampshire',
    state: 'WV',
    zip: '26704',
    listing_slug: ADVENT_LISTING_SLUG,
  });
}

function buildAdminLeadMessage(lead) {
  return [
    `${leadTypeLabel(lead.lead_type)} lead`,
    `Property: ${lead.property_address || ADVENT_PROPERTY_ADDRESS}`,
    `Buyer type: ${lead.buyer_type || lead.buyer_intent || '(not provided)'}`,
    `Cash/Financing: ${lead.cash_or_financing || lead.financing_type || '(not provided)'}`,
    `Timeline: ${lead.timeline || '(not provided)'}`,
    `SMS consent: ${lead.sms_consent ? 'Yes' : 'No'}`,
    `UTM source: ${lead.utm_source || '(none)'}`,
    `UTM medium: ${lead.utm_medium || '(none)'}`,
    `UTM campaign: ${lead.utm_campaign || '(none)'}`,
    '',
    'Message:',
    lead.message || '(no message)',
  ].join('\n');
}

module.exports = {
  ADVENT_LISTING_SLUG,
  ADVENT_PROPERTY_ADDRESS,
  buildLeadSchedule,
  buildPropertyLead,
  build37AdventLead,
  buildAdminLeadMessage,
  formatPropertyAddress,
  leadTypeLabel,
  normalizePhone,
  normalizeLeadType,
  sanitizeLeadPayload,
  validateLeadPayload,
};
