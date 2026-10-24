import { db } from "./db";
import { calculate, money, type Quote } from "./quote";
import { sendTemplate, TEMPLATES, whatsappReady, WhatsAppError } from "./whatsapp";
import { normalizePhone } from "./phone";

export interface QuoteRow {
  id: string;
  owner_id: string;
  token: string;
  payload: Quote;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  auto_reminders: boolean;
}

export type PatientKind = "proposal" | "unopened" | "followup" | "expiring";

const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;
const brDate = (iso: string) => iso.split("-").reverse().join("/");

async function log(quoteId: string, kind: string, to: string, waId: string | null, error: string | null) {
  await db()`INSERT INTO whatsapp_messages(quote_id,kind,to_phone,wa_message_id,status,error)
    VALUES(${quoteId},${kind},${to},${waId},${error ? "failed" : "sent"},${error})`;
}

/** Sends an approved template to the patient with a button pointing to /p/{token}, and records it. */
export async function sendToPatient(q: QuoteRow, kind: PatientKind) {
  const to = normalizePhone(q.payload.patientPhone);
  if (!to) throw new WhatsAppError("Cadastre o WhatsApp do paciente no orçamento.");
  const p = q.payload;
  const template = { proposal: TEMPLATES.proposal, unopened: TEMPLATES.unopened, followup: TEMPLATES.followup, expiring: TEMPLATES.expiring }[kind]();
  const body = kind === "expiring" ? [firstName(p.patient), p.clinic, brDate(p.validity)] : [firstName(p.patient), p.clinic];
  try {
    const r = await sendTemplate({ to, template, body, urlSuffix: q.token });
    await log(q.id, kind, to, r.id, null);
    if (kind === "proposal") await db()`UPDATE quotes SET sent_at=COALESCE(sent_at,now()) WHERE id=${q.id}`;
    await db()`INSERT INTO quote_events(quote_id,type,data) VALUES(${q.id},${kind === "proposal" ? "sent" : "reminder"},${JSON.stringify({ channel: "api", kind })}::jsonb)`;
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no envio.";
    await log(q.id, kind, to, null, msg).catch(() => {});
    throw e instanceof WhatsAppError ? e : new WhatsAppError(msg);
  }
}

/** Best-effort alert to the clinic's own WhatsApp (never blocks the patient's action). */
export async function notifyClinic(q: QuoteRow, kind: "accepted" | "question", text = "") {
  const to = normalizePhone(q.payload.clinicPhone);
  if (!to || !whatsappReady()) return;
  const p = q.payload;
  const tpl = kind === "accepted" ? TEMPLATES.clinicAccepted() : TEMPLATES.clinicQuestion();
  const body = kind === "accepted" ? [p.patient, money(calculate(p).net)] : [p.patient, text];
  try {
    const r = await sendTemplate({ to, template: tpl, body });
    await log(q.id, `clinic_${kind}`, to, r.id, null);
  } catch (e) {
    await log(q.id, `clinic_${kind}`, to, null, e instanceof Error ? e.message : "Falha").catch(() => {});
  }
}

export async function quoteByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const rows = await db()`SELECT id,owner_id,token,payload,created_at,updated_at,sent_at,expires_at,accepted_at,accepted_name,auto_reminders FROM quotes WHERE token=${token}`;
  return (rows[0] as QuoteRow | undefined) ?? null;
}

export const isExpired = (q: Pick<QuoteRow, "expires_at">, now = new Date()) => Boolean(q.expires_at && new Date(q.expires_at) < now);
