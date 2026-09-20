import { logger } from "./logger";
import { getSetting } from "./settings";

/**
 * Resolved email provider config — either what the admin saved at Admin ->
 * Settings -> Email (DB, via lib/settings.ts, same pattern as the AI
 * provider / Cloudinary settings) or, if nothing's saved there, whatever
 * is in the environment. DB wins so an admin can set this up — and change
 * it — from the settings UI without a redeploy; env vars remain a valid
 * way to configure this for a deployment that never touches the admin UI
 * at all (e.g. self-hosted with secrets injected by the platform).
 */
/** One Brevo account. Slot 1 is the original BREVO_API_KEY; 2..N are extra
 * accounts (each free Brevo plan has its own daily sending quota, so a few
 * accounts = a few times the headroom, and one bad key doesn't stop mail). */
export interface BrevoSlot {
  slot: number;
  apiKey: string;
  /** Sender to use with this account — blank means the global "From" email.
   * Brevo only accepts senders verified on the sending account itself. */
  senderEmail?: string;
}

export const BREVO_MAX_SLOTS = 5;

interface EmailConfig {
  provider: "brevo" | "custom" | "smtp";
  brevoSlots?: BrevoSlot[];
  /** "failover" (default): always start with slot 1, move on only when a
   * send fails. "round_robin": spread sends across the slots in turn. */
  brevoStrategy?: "failover" | "round_robin";
  customApiUrl?: string;
  customApiKey?: string;
  customApiKeyHeader?: string;
  customApiKeyPrefix?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  senderEmail: string;
  senderName: string;
}

async function resolveEmailConfig(): Promise<EmailConfig | null> {
  const dbProvider = await getSetting("EMAIL_PROVIDER", null);
  const senderEmail = (await getSetting("MAIL_FROM", null)) || process.env.MAIL_FROM || "no-reply@medschoolproffs.com";
  const senderName = (await getSetting("MAIL_FROM_NAME", null)) || process.env.BREVO_SENDER_NAME || "MedschoolProffs";

  // 1. Whatever the admin picked at Admin -> Settings -> Email, if it has
  // the fields it needs to actually work.
  if (dbProvider === "brevo") {
    const brevoSlots: BrevoSlot[] = [];
    for (let slot = 1; slot <= BREVO_MAX_SLOTS; slot++) {
      const suffix = slot === 1 ? "" : `_${slot}`;
      const apiKey = (await getSetting(`BREVO_API_KEY${suffix}`, null))?.trim();
      if (!apiKey) continue;
      const slotSender = slot === 1 ? undefined : (await getSetting(`BREVO_SENDER_EMAIL${suffix}`, null))?.trim() || undefined;
      brevoSlots.push({ slot, apiKey, senderEmail: slotSender });
    }
    if (brevoSlots.length) {
      const strategy = (await getSetting("BREVO_SLOT_STRATEGY", null)) === "round_robin" ? "round_robin" : "failover";
      return { provider: "brevo", brevoSlots, brevoStrategy: strategy, senderEmail, senderName };
    }
  } else if (dbProvider === "custom") {
    const customApiUrl = await getSetting("CUSTOM_EMAIL_API_URL", null);
    if (customApiUrl) {
      return {
        provider: "custom",
        customApiUrl,
        customApiKey: (await getSetting("CUSTOM_EMAIL_API_KEY", null)) ?? undefined,
        customApiKeyHeader: (await getSetting("CUSTOM_EMAIL_API_KEY_HEADER", null)) ?? undefined,
        customApiKeyPrefix: (await getSetting("CUSTOM_EMAIL_API_KEY_PREFIX", null)) ?? undefined,
        senderEmail, senderName,
      };
    }
  } else if (dbProvider === "smtp") {
    const smtpHost = await getSetting("SMTP_HOST", null);
    const smtpPort = await getSetting("SMTP_PORT", null);
    const smtpUser = await getSetting("SMTP_USER", null);
    const smtpPass = await getSetting("SMTP_PASS", null);
    if (smtpHost && smtpPort && smtpUser && smtpPass) {
      return { provider: "smtp", smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, senderName };
    }
  }

  // 2. Environment variables — same order as before this settings UI
  // existed, so a deployment that only ever used env vars keeps working
  // unchanged.
  if (process.env.BREVO_API_KEY) {
    const brevoSlots: BrevoSlot[] = [{ slot: 1, apiKey: process.env.BREVO_API_KEY }];
    for (let slot = 2; slot <= BREVO_MAX_SLOTS; slot++) {
      const apiKey = process.env[`BREVO_API_KEY_${slot}`]?.trim();
      if (apiKey) brevoSlots.push({ slot, apiKey });
    }
    return { provider: "brevo", brevoSlots, brevoStrategy: process.env.BREVO_SLOT_STRATEGY === "round_robin" ? "round_robin" : "failover", senderEmail: process.env.BREVO_SENDER_EMAIL || senderEmail, senderName };
  }
  if (process.env.CUSTOM_EMAIL_API_URL) {
    return {
      provider: "custom",
      customApiUrl: process.env.CUSTOM_EMAIL_API_URL,
      customApiKey: process.env.CUSTOM_EMAIL_API_KEY,
      customApiKeyHeader: process.env.CUSTOM_EMAIL_API_KEY_HEADER,
      customApiKeyPrefix: process.env.CUSTOM_EMAIL_API_KEY_PREFIX,
      senderEmail, senderName,
    };
  }
  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return { provider: "smtp", smtpHost: process.env.SMTP_HOST, smtpPort: process.env.SMTP_PORT, smtpUser: process.env.SMTP_USER, smtpPass: process.env.SMTP_PASS, senderEmail, senderName };
  }

  return null;
}

/**
 * Sends transactional email through whichever provider resolveEmailConfig()
 * finds configured (DB settings first, then env vars); if nothing at all is
 * configured, logs the email instead of sending so every flow (signup,
 * forgot-password, trial grant, payment review) stays testable without a
 * mail provider set up. Every provider function throws on failure — this is
 * the one place that catches and logs, so every call site's existing
 * `.catch(() => {})` still behaves the same way on a failed send as before.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const config = await resolveEmailConfig();
    if (config?.provider === "brevo") { await sendViaBrevo(to, subject, html, config); return; }
    if (config?.provider === "custom") { await sendViaCustomApi(to, subject, html, config); return; }
    if (config?.provider === "smtp") { await sendViaSmtp(to, subject, html, config); return; }
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
    return;
  }

  logger.info({ to, subject }, "[email:dev-mode] No email provider configured — logging email instead of sending");
  // eslint-disable-next-line no-console
  console.log(`\n----- DEV EMAIL -----\nTo: ${to}\nSubject: ${subject}\n${html}\n----------------------\n`);
}

let brevoRoundRobinCursor = 0;

async function sendViaBrevoSlot(to: string, subject: string, html: string, config: EmailConfig, slot: BrevoSlot): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "api-key": slot.apiKey },
    body: JSON.stringify({ sender: { email: slot.senderEmail || config.senderEmail, name: config.senderName }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo slot ${slot.slot} send failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

/**
 * Sends through the configured Brevo accounts. In "failover" mode slot 1 is
 * always tried first and the next slot is only used when a send fails (bad
 * key, daily quota reached, Brevo outage); in "round_robin" mode sends are
 * spread across the slots in turn, with the rest still there as fallbacks
 * for that one message. Only throws when every configured slot failed, and
 * then lists why each one did — so "which key is broken" is in the log.
 */
async function sendViaBrevo(to: string, subject: string, html: string, config: EmailConfig): Promise<void> {
  const slots = config.brevoSlots ?? [];
  if (!slots.length) throw new Error("Brevo has no API key configured.");
  const start = config.brevoStrategy === "round_robin" ? brevoRoundRobinCursor++ % slots.length : 0;
  const ordered = [...slots.slice(start), ...slots.slice(0, start)];
  const failures: string[] = [];
  for (const slot of ordered) {
    try {
      await sendViaBrevoSlot(to, subject, html, config, slot);
      if (failures.length) logger.warn({ usedSlot: slot.slot, failures }, "Brevo send succeeded on a fallback slot");
      return;
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(failures.join(" | "));
}

/**
 * A deliberately generic contract so any provider's API — or an internal
 * mail microservice — can sit behind this without a bespoke integration:
 * POST a { to, subject, html, from, fromName } JSON body to the configured
 * URL. Auth header is configurable since providers disagree on the header
 * name and scheme (defaults to "Authorization: Bearer <key>"; set the
 * prefix to an empty string for providers that want the raw key in a
 * header like "api-key").
 */
async function sendViaCustomApi(to: string, subject: string, html: string, config: EmailConfig): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.customApiKey) {
    const headerName = config.customApiKeyHeader || "Authorization";
    const prefix = config.customApiKeyPrefix ?? "Bearer ";
    headers[headerName] = `${prefix}${config.customApiKey}`;
  }
  const res = await fetch(config.customApiUrl as string, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, subject, html, from: config.senderEmail, fromName: config.senderName }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Custom email API send failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

async function sendViaSmtp(to: string, subject: string, html: string, config: EmailConfig): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.default.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort),
    secure: Number(config.smtpPort) === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  await transport.sendMail({ from: config.senderEmail, to, subject, html });
}

/**
 * Sends a one-off test email through whatever provider is currently
 * configured, so the admin settings page can confirm the setup actually
 * works instead of just checking that fields aren't blank (same "real
 * connectivity check" pattern as POST /admin/settings/test-storage for
 * Cloudinary). Throws with the real provider error on failure — unlike
 * sendEmail() above, this one call site wants to know exactly what went
 * wrong, not silently fall back to dev-log mode.
 */
export async function sendTestEmail(to: string, slot?: number): Promise<void> {
  const config = await resolveEmailConfig();
  if (!config) throw new Error("No email provider is configured yet.");
  if (config.provider === "brevo") {
    // A specific slot is tested on its own, with no failover — the point of
    // testing one key is to learn whether THAT key works, not whether some
    // other slot could cover for it.
    if (slot !== undefined) {
      const target = config.brevoSlots?.find((s) => s.slot === slot);
      if (!target) throw new Error(`Brevo slot ${slot} has no API key saved yet — save your settings first.`);
      return sendViaBrevoSlot(to, "MedschoolProffs test email", testEmailHtml(), config, target);
    }
    return sendViaBrevo(to, "MedschoolProffs test email", testEmailHtml(), config);
  }
  if (config.provider === "custom") return sendViaCustomApi(to, "MedschoolProffs test email", testEmailHtml(), config);
  return sendViaSmtp(to, "MedschoolProffs test email", testEmailHtml(), config);
}

function testEmailHtml(): string {
  return `<p>This is a test email from MedschoolProffs admin settings.</p><p>If you're reading this, your email provider is configured correctly.</p>`;
}

/**
 * Registration now confirms the student's email with a 6-digit OTP typed
 * into the app instead of a click-a-link URL (see POST /auth/verify-otp) —
 * quicker on mobile and doesn't depend on the email client rendering links
 * usably. The code is shown large/spaced-out so it's easy to read and
 * retype without miscounting digits.
 */
export function otpEmailHtml(name: string, code: string): string {
  const spaced = code.split("").join(" ");
  return `<p>Hi ${name},</p><p>Welcome to MedschoolProffs. Use this code to verify your email address:</p><p style="font-size:32px;font-weight:800;letter-spacing:4px;margin:16px 0;">${spaced}</p><p>This code expires in 10 minutes. If you didn't create this account, you can ignore this email.</p>`;
}

/**
 * Sent once, right after a student's email is verified (not at signup —
 * at signup they haven't proven the address is real yet). This is the
 * "welcome code etc" email: a proper welcome now that the account is
 * actually usable, distinct from the verification link email above.
 */
export function welcomeEmailHtml(name: string, loginUrl: string): string {
  return `<p>Hi ${name},</p><p>Your email is verified and your MedschoolProffs account is ready to go. Welcome aboard!</p><p>Log in to get started:</p><p><a href="${loginUrl}">${loginUrl}</a></p><p>If you ever need help, just reply to this email.</p>`;
}

export function resetPasswordEmailHtml(name: string, resetUrl: string): string {
  return `<p>Hi ${name},</p><p>We received a request to reset your password. Click below to choose a new one:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>`;
}

export function membershipActivatedEmailHtml(name: string, planName: string | null, expiresAt: Date): string {
  const expiry = expiresAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return `<p>Hi ${name},</p><p>Good news — your payment has been verified and your MedschoolProffs membership is now <strong>active</strong>${planName ? ` (${planName})` : ""}.</p><p>Your access is valid until <strong>${expiry}</strong>.</p><p>Log in any time to pick up where you left off.</p>`;
}

/**
 * Was previously just membershipActivatedEmailHtml(name, "Trial access",
 * expiresAt) — that produced "your membership is now active (Trial
 * access)", which reads like a paid plan. A trial gets its own wording so
 * it's clear no payment happened and when free access actually ends.
 */
export function trialActivatedEmailHtml(name: string, expiresAt: Date): string {
  const expiry = expiresAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return `<p>Hi ${name},</p><p>Your MedschoolProffs trial has started — you now have full access to the platform, free.</p><p>Your trial runs until <strong>${expiry}</strong>. We'll let you know before it ends.</p><p>Log in any time to explore.</p>`;
}

/** Sent the moment a student submits payment proof, before any admin review. */
export function paymentSubmittedEmailHtml(name: string, planName: string | null): string {
  return `<p>Hi ${name},</p><p>We've received your payment submission${planName ? ` for <strong>${planName}</strong>` : ""} and it's now awaiting review.</p><p>We'll email you as soon as it's verified — this usually doesn't take long.</p>`;
}

/** Sent when an admin rejects a submitted payment, with the reason they gave. */
export function paymentRejectedEmailHtml(name: string, reason: string): string {
  return `<p>Hi ${name},</p><p>We weren't able to verify your recent payment submission.</p><p><strong>Reason:</strong> ${reason}</p><p>You're welcome to submit it again with corrected details, or reach out to support if you think this is a mistake.</p>`;
}

/** Sent when an admin rejects a student's account application, with the message they gave. */
export function accountRejectedEmailHtml(name: string, message: string): string {
  return `<p>Hi ${name},</p><p>Your MedschoolProffs account application wasn't approved.</p><p><strong>Message from the team:</strong> ${message}</p><p>If you think this is a mistake or have questions, please reach out to support.</p>`;
}

/** Sent to the opponent the moment a challenge is created — see POST /challenges. */
export function challengeInviteEmailHtml(opponentName: string, challengerName: string, questionCount: number, appUrl: string): string {
  return `<p>Hi ${opponentName},</p><p><strong>${challengerName}</strong> just challenged you to a ${questionCount}-question quiz match on MedschoolProffs.</p><p><a href="${appUrl}/challenge">Accept the challenge and play</a></p><p>Whoever scores higher wins bragging rights — good luck!</p>`;
}

/** Sent to both players once each has a completed attempt on the same challenge — see POST /challenges/:id/submit. */
export function challengeResultEmailHtml(name: string, opponentName: string, outcome: "won" | "lost" | "tied", myScore: number, opponentScore: number, appUrl: string): string {
  const line = outcome === "won" ? `You beat ${opponentName}! 🎉` : outcome === "lost" ? `${opponentName} narrowly got the better of you this time.` : `It's a tie with ${opponentName}!`;
  return `<p>Hi ${name},</p><p>Your quiz challenge against <strong>${opponentName}</strong> is complete.</p><p><strong>${line}</strong></p><p>Your score: ${myScore}% · ${opponentName}'s score: ${opponentScore}%</p><p><a href="${appUrl}/challenge">See the full result and challenge them again</a></p>`;
}
