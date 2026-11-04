const { sendEmail, sendWhatsApp, getSettings } = require('../services/notification.service');

async function config(req, res) {
  const settings = await getSettings();
  res.json({ success: true, notifications: {
    ...settings.notifications,
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
  }});
}
async function testEmail(req, res) {
  try {
    const to = req.body.to || req.user.email;
    const result = await sendEmail({ to, subject: req.body.subject || 'ZKTeco Attendance email test', text: req.body.text || 'Email notifications are working.' });
    res.json({ success: true, result });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}
async function testWhatsApp(req, res) {
  try {
    const result = await sendWhatsApp({ to: req.body.to, text: req.body.text || 'ZKTeco Attendance WhatsApp notification test.' });
    res.json({ success: true, result });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}
module.exports = { config, testEmail, testWhatsApp };
