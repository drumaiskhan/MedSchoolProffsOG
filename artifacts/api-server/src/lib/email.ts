import { logger } from "./logger";

/**
 * Sends transactional email via SMTP when configured (SMTP_HOST/PORT/USER/PASS
 * + MAIL_FROM env vars). When SMTP isn't configured (e.g. local dev), the
 * email is logged instead of sent so flows are testable without a mail
 * server. Swap in a provider SDK (SendGrid, Postmark, SES...) here if
 * preferred — the call sites don't need to change.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    logger.info({ to, subject }, "[email:dev-mode] SMTP not configured — logging email instead of sending");
    // eslint-disable-next-line no-console
    console.log(`\n----- DEV EMAIL -----\nTo: ${to}\nSubject: ${subject}\n${html}\n----------------------\n`);
    return;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, html });
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
  }
}

export function verificationEmailHtml(name: string, verifyUrl: string): string {
  return `<p>Hi ${name},</p><p>Welcome to MedschoolProffs. Please verify your email address to activate your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`;
}

export function resetPasswordEmailHtml(name: string, resetUrl: string): string {
  return `<p>Hi ${name},</p><p>We received a request to reset your password. Click below to choose a new one:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>`;
}

export function membershipActivatedEmailHtml(name: string, planName: string | null, expiresAt: Date): string {
  const expiry = expiresAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return `<p>Hi ${name},</p><p>Good news — your payment has been verified and your MedschoolProffs membership is now <strong>active</strong>${planName ? ` (${planName})` : ""}.</p><p>Your access is valid until <strong>${expiry}</strong>.</p><p>Log in any time to pick up where you left off.</p>`;
}
