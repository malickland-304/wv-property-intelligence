'use strict';

const { isEmailConfigured, sendMail } = require('./email');
const { leadTypeLabel } = require('../utils/validators');

function getNotificationEmail() {
  return process.env.LEADS_NOTIFICATION_EMAIL || process.env.NOTIFICATION_EMAIL || '';
}

function isLeadEmailConfigured() {
  return Boolean(getNotificationEmail() && isEmailConfigured());
}

async function sendLeadNotificationEmail(lead) {
  const to = getNotificationEmail();
  if (!to || !isEmailConfigured() || !lead) return false;

  const bodyText = [
    `New ${leadTypeLabel(lead.lead_type)} lead`,
    '',
    `Listing: ${lead.property_address}`,
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email || '(not provided)'}`,
    `Buyer type: ${lead.buyer_type || lead.buyer_intent || '(not provided)'}`,
    `Cash/Financing: ${lead.cash_or_financing || lead.financing_type || '(not provided)'}`,
    `Timeline: ${lead.timeline || '(not provided)'}`,
    `Lead type: ${leadTypeLabel(lead.lead_type)}`,
    `Next follow-up: ${lead.next_follow_up_at || '(not scheduled)'}`,
    `SMS consent: ${lead.sms_consent ? 'Yes' : 'No'}`,
    `Source: ${lead.source || '(not provided)'}`,
    `UTM source: ${lead.utm_source || '(none)'}`,
    `UTM medium: ${lead.utm_medium || '(none)'}`,
    `UTM campaign: ${lead.utm_campaign || '(none)'}`,
    '',
    'Message:',
    lead.message || '(no message)',
  ].join('\n');

  return sendMail({
    to,
    subject: `New ${leadTypeLabel(lead.lead_type)} lead: ${lead.name}`,
    text: bodyText,
    replyTo: lead.email || undefined,
  });
}

async function sendLeadAutoReplyEmail(lead, followUps = []) {
  if (!lead || !lead.email || !isEmailConfigured()) return false;

  const immediate = followUps[0];
  if (!immediate) return false;

  return sendMail({
    to: lead.email,
    subject: immediate.subject,
    text: immediate.body,
    replyTo: getNotificationEmail() || undefined, // buyer replies reach Phil, not noreply@
  });
}

module.exports = { isLeadEmailConfigured, sendLeadNotificationEmail, sendLeadAutoReplyEmail };
