/**
 * Sends email through SMTP when SMTP_HOST is configured (uses nodemailer).
 * Without SMTP, development just prints the message — including the reset link — to the server console
 * so the flow can be tested locally. In production a missing SMTP config is logged and nothing sensitive is printed.
 */
let transport;
async function getTransport() {
  if (transport !== undefined) return transport;
  if (!process.env.SMTP_HOST) return (transport = null);
  try {
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch (err) {
    console.error('SMTP configured but nodemailer could not be loaded. Run `npm install` in /server.', err.message);
    transport = null;
  }
  return transport;
}

export async function sendMail({ to, subject, text, html }) {
  const t = await getTransport();
  if (t) {
    await t.sendMail({ from: process.env.MAIL_FROM || 'LuxuryStay <no-reply@luxurystay.local>', to, subject, text, html });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    console.error(`[mail] SMTP is not configured; email "${subject}" to ${to} was NOT sent.`);
    return;
  }
  console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
}
