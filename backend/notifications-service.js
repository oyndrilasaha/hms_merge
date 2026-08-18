'use strict';

const { audit } = require('./database');

async function sendEmailViaSendGrid({ to, subject, textHtml, apiKey = process.env.SENDGRID_API_KEY }) {
  if (!apiKey) return { sent: false, reason: 'No SendGrid API Key configured; using DB queue.' };
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.NOTIFICATION_FROM_EMAIL || 'noreply@stgeorge.local', name: 'St George Hospital' },
        subject,
        content: [{ type: 'text/html', value: textHtml }]
      })
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendSmsViaTwilio({ to, body, sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN }) {
  if (!sid || !token) return { sent: false, reason: 'No Twilio credentials configured; using DB queue.' };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', process.env.TWILIO_PHONE_NUMBER || '+15005550006');
    params.append('Body', body);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function dispatchNotification(db, { recipientUserId, recipientContact, channel = 'In-App', template, message }) {
  // Store notification in database
  db.prepare(`
    INSERT INTO notifications (recipient_user_id, recipient_contact, channel, template, message, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recipientUserId || null, recipientContact || null, channel, template, message, 'Sent');

  let providerStatus = { sent: true, mode: 'Mock / Internal Queue' };

  if (channel === 'Email' && recipientContact) {
    providerStatus = await sendEmailViaSendGrid({ to: recipientContact, subject: `St George Hospital: ${template}`, textHtml: `<p>${message}</p>` });
  } else if (channel === 'SMS' && recipientContact) {
    providerStatus = await sendSmsViaTwilio({ to: recipientContact, body: message });
  }

  audit(db, {
    actorUserId: recipientUserId || 1,
    action: 'NOTIFICATION_DISPATCHED',
    entityType: 'notification',
    entityId: template,
    details: { channel, recipientContact, providerStatus }
  });

  return providerStatus;
}

module.exports = {
  dispatchNotification,
  sendEmailViaSendGrid,
  sendSmsViaTwilio
};
