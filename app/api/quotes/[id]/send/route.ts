import { currentUser, db, json, readJson, sameOrigin } from "@/lib/db";
import { sendToPatient, type QuoteRow } from "@/lib/proposals";
import { whatsappReady, WhatsAppError } from "@/lib/whatsapp";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ kind: z.enum(["proposal", "unopened", "followup", "expiring"]).default("proposal") });

/** Sends the proposal (or a reminder) automatically through the official WhatsApp Cloud API. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const u = await currentUser(req);
    if (!u) return json({ error: "Entre para enviar." }, 401);
    if (!whatsappReady()) return json({ error: "Envio automático indisponível: configure a API oficial do WhatsApp.", fallback: true }, 409);
    const { id } = await ctx.params;
    const parsed = body.safeParse(await readJson(req).catch(() => ({})));
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Requisição inválida." }, 400);
    const rows = await db()`SELECT id,owner_id,token,payload,created_at,updated_at,sent_at,expires_at,accepted_at,accepted_name,auto_reminders FROM quotes WHERE id=${id} AND owner_id=${u.id}`;
    const q = rows[0] as QuoteRow | undefined;
    if (!q) return json({ error: "Orçamento não encontrado." }, 404);
    const r = await sendToPatient(q, parsed.data.kind);
    return json({ ok: true, messageId: r.id });
  } catch (e) {
    if (e instanceof WhatsAppError) return json({ error: e.message, fallback: true }, 502);
    return json({ error: "Não foi possível enviar agora." }, 503);
  }
}
