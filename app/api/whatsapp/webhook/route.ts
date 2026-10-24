import { db, json } from "@/lib/db";
import { STATUS_RANK, validSignature } from "@/lib/whatsapp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface WaStatus { id: string; status: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] }
interface WaMessage { from: string; type: string; text?: { body?: string }; button?: { text?: string } }
interface WaPayload { entry?: { changes?: { value?: { statuses?: WaStatus[]; messages?: WaMessage[] } }[] }[] }

const PATIENT_KINDS = new Set(["proposal", "unopened", "followup", "expiring"]);

/** Delivery/read receipts and patient replies. Always answers 200 quickly so Meta does not retry storms. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
  try {
    const body = JSON.parse(raw) as WaPayload;
    const sql = db();
    for (const entry of body.entry ?? []) for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const rows = await sql`SELECT id,quote_id,kind,status FROM whatsapp_messages WHERE wa_message_id=${s.id}`;
        const m = rows[0];
        if (!m || (STATUS_RANK[s.status] ?? -1) <= (STATUS_RANK[m.status] ?? -1)) continue;
        const err = s.errors?.[0] ? (s.errors[0].error_data?.details || s.errors[0].message || s.errors[0].title || "Falha") : null;
        await sql`UPDATE whatsapp_messages SET status=${s.status},error=${err},updated_at=now() WHERE id=${m.id}`;
        if (PATIENT_KINDS.has(m.kind) && (s.status === "read" || s.status === "failed")) {
          await sql`INSERT INTO quote_events(quote_id,type,data) VALUES(${m.quote_id},${s.status === "read" ? "wa_read" : "wa_failed"},${JSON.stringify({ kind: m.kind, error: err })}::jsonb)`;
        }
      }
      for (const msg of change.value?.messages ?? []) {
        // Attach the reply to the latest quote sent to this number.
        const q = await sql`SELECT quote_id FROM whatsapp_messages WHERE to_phone=${msg.from} AND kind=ANY(${[...PATIENT_KINDS]}) ORDER BY created_at DESC LIMIT 1`;
        if (!q[0]) continue;
        const text = (msg.text?.body ?? msg.button?.text ?? `[${msg.type}]`).slice(0, 1000);
        await sql`INSERT INTO quote_events(quote_id,type,data) VALUES(${q[0].quote_id},'wa_reply',${JSON.stringify({ text })}::jsonb)`;
        await sql`UPDATE quotes SET updated_at=now() WHERE id=${q[0].quote_id}`;
      }
    }
  } catch {
    // Swallow: malformed payloads must not trigger retries.
  }
  return json({ ok: true });
}
