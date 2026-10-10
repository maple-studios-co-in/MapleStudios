import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { logger } from "../logger.js";

export interface MailMessage {
  to: string;
  from: { name: string; email: string };
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface MailProvider {
  readonly name: "resend" | "dry-run";
  send(message: MailMessage): Promise<{ id: string }>;
}

/** Nothing leaves the box. The message is logged so a campaign can be
    rehearsed end to end before a real key exists. */
export class DryRunProvider implements MailProvider {
  readonly name = "dry-run" as const;
  async send(message: MailMessage) {
    const id = `dry-${crypto.randomUUID()}`;
    logger.info({ to: message.to, subject: message.subject, id }, "mail: dry-run send");
    return { id };
  }
}

export class ResendProvider implements MailProvider {
  readonly name = "resend" as const;
  constructor(private readonly apiKey: string) {}

  async send(message: MailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${message.from.name} <${message.from.email}>`,
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }
}

let active: MailProvider | null = null;

/** The configured provider — dry-run unless RESEND_API_KEY is a real key. */
export function getMailProvider(): MailProvider {
  if (active) return active;
  active = env.mailLive && env.RESEND_API_KEY ? new ResendProvider(env.RESEND_API_KEY) : new DryRunProvider();
  if (active.name === "dry-run" && !env.isTest) logger.warn("mail: RESEND_API_KEY is not a real key — sends are dry-run");
  return active;
}

/** Tests swap in a fake; pass null to go back to the configured one. */
export function setMailProvider(provider: MailProvider | null) {
  active = provider;
}
