import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./phone";

// Official WhatsApp Business Cloud API (Meta). Business-initiated messages MUST use approved templates.
// Template texts to submit in WhatsApp Manager are documented in docs/whatsapp.md.

export const whatsappReady = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

const env = (k: string, d: string) => process.env[k] || d;
export const TEMPLATES = {
  proposal: () => env("WHATSAPP_TEMPLATE_PROPOSAL", "orcamento_enviado"),
  unopened: () => env("WHATSAPP_TEMPLATE_UNOPENED", "orcamento_lembrete"),
  followup: () => env("WHATSAPP_TEMPLATE_FOLLOWUP", "orcamento_duvida"),
  expiring: () => env("WHATSAPP_TEMPLATE_EXPIRING", "orcamento_expirando"),
  clinicAccepted: () => env("WHATSAPP_TEMPLATE_CLINIC_ACCEPTED", "orcamento_aprovado_clinica"),
  clinicQuestion: () => env("WHATSAPP_TEMPLATE_CLINIC_QUESTION", "orcamento_duvida_clinica"),
};

export class WhatsAppError extends Error {}

/** Template params cannot contain newlines, tabs or 4+ consecutive spaces. */
const clean = (s: string) => s.replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900) || "-";

export async function sendTemplate(opts: { to: string; template: string; body: string[]; urlSuffix?: string }): Promise<{ id: string; to: string }> {
  if (!whatsappReady()) throw new WhatsAppError("WhatsApp Cloud API não configurada.");
  const to = normalizePhone(opts.to);
  if (!to) throw new WhatsAppError("Telefone inválido.");
  const components: unknown[] = [{ type: "body", parameters: opts.body.map(text => ({ type: "text", text: clean(text) })) }];
  if (opts.urlSuffix) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: opts.urlSuffix }] });
  const version = env("WHATSAPP_API_VERSION", "v22.0");
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: { name: opts.template, language: { code: env("WHATSAPP_TEMPLATE_LANG", "pt_BR") }, components },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string; error_data?: { details?: string } } };
  if (!res.ok || !data.messages?.[0]?.id) {
    throw new WhatsAppError(data.error?.error_data?.details || data.error?.message || `Falha no envio (HTTP ${res.status}).`);
  }
  return { id: data.messages[0].id, to };
}

/** Validates X-Hub-Signature-256 from Meta webhooks. Without WHATSAPP_APP_SECRET, webhooks are rejected. */
export function validSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Delivery statuses only move forward (a late "delivered" must not overwrite "read"). */
export const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
