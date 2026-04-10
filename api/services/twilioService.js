'use strict';

const { leadTypeLabel } = require('../utils/validators');

function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.LEAD_ALERT_TO_NUMBER
  );
}

function getTwilioClient() {
  if (!isTwilioConfigured()) return null;

  try {
    const twilio = require('twilio');
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (error) {
    console.error('[Twilio] Package unavailable:', error.message);
    return null;
  }
}

async function sendLeadAlertSms(lead) {
  const client = getTwilioClient();
  if (!client) return false;

  const body = [
    `New ${leadTypeLabel(lead.lead_type)} lead`,
    `Property: ${lead.property_address}`,
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email || '(missing)'}`,
    `Buyer: ${lead.buyer_type || lead.buyer_intent || '(not provided)'}`,
    `Cash/Financing: ${lead.cash_or_financing || lead.financing_type || '(not provided)'}`,
  ].join('\n');

  try {
    await client.messages.create({
      to: process.env.LEAD_ALERT_TO_NUMBER,
      from: process.env.TWILIO_FROM_NUMBER,
      body,
    });
    return true;
  } catch (error) {
    console.error('[Twilio] Failed to send lead alert:', error.message);
    return false;
  }
}

module.exports = { isTwilioConfigured, sendLeadAlertSms };
