const { Settings, Employee } = require('../models');

async function getSettings() {
  let settings = await Settings.findOne({ key: 'system' }).lean();
  if (!settings) settings = (await Settings.create({ key: 'system' })).toObject();
  return settings;
}

async function sendEmail({ to, subject, text, html }) {
  const settings = await getSettings();
  if (!settings.notifications?.emailEnabled) return { skipped: true, reason: 'Email notifications are disabled' };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const recipients = Array.isArray(to) ? to : [to];
  const valid = recipients.filter(Boolean);
  if (!valid.length) throw new Error('No email recipient supplied');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: settings.notifications.emailFrom || process.env.EMAIL_FROM, to: valid, subject, text, html: html || `<p>${String(text || '').replace(/\n/g, '<br>')}</p>` })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Email provider error ${response.status}: ${body}`);
  return { sent: true, provider: 'resend', response: JSON.parse(body) };
}

async function sendWhatsApp({ to, text }) {
  const settings = await getSettings();
  if (!settings.notifications?.whatsappEnabled) return { skipped: true, reason: 'WhatsApp notifications are disabled' };
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required');
  const recipient = String(to || settings.notifications.whatsappDefaultTo || '').replace(/[^0-9]/g, '');
  if (!recipient) throw new Error('WhatsApp recipient is required');
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'text', text: { preview_url: false, body: text } })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`WhatsApp provider error ${response.status}: ${body}`);
  return { sent: true, provider: 'whatsapp-cloud-api', response: JSON.parse(body) };
}

async function notifyEmployee(employeeId, event, subject, text) {
  const settings = await getSettings();
  const employee = await Employee.findOne({ employeeId }).lean();
  if (!employee) return { skipped: true, reason: 'Employee not found' };
  const eventEnabled = settings.notifications?.[event] !== false;
  if (!eventEnabled) return { skipped: true, reason: `${event} notification disabled` };
  const results = {};
  if (settings.notifications?.emailEnabled && employee.email) {
    results.email = await sendEmail({ to: employee.email, subject, text });
  }
  if (settings.notifications?.whatsappEnabled && employee.phone) {
    results.whatsapp = await sendWhatsApp({ to: employee.phone, text });
  }
  return results;
}

module.exports = { getSettings, sendEmail, sendWhatsApp, notifyEmployee };
