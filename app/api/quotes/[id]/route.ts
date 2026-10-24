import { currentUser, db, json, proposalUrl, readJson, sameOrigin } from "@/lib/db";
import { expiresAt, quoteSchema } from "@/lib/quote";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function owned(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return null;
  const u = await currentUser(req);
  if (!u) return null;
  const rows = await db()`SELECT id,token,payload,created_at,updated_at,sent_at,expires_at,accepted_at,accepted_name,accepted_ip,accepted_snapshot,auto_reminders FROM quotes WHERE id=${id} AND owner_id=${u.id}`;
  return rows[0] ?? null;
}

/** Full tracking detail: visits, timeline and WhatsApp delivery log. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const q = await owned(req, ctx);
    if (!q) return json({ error: "Orçamento não encontrado." }, 404);
    const sql = db();
    const [views, events, messages] = await Promise.all([
      sql`SELECT id,started_at AS "startedAt",last_seen_at AS "lastSeenAt",active_ms AS "activeMs",max_scroll AS "maxScroll",sections,device,referrer FROM quote_views WHERE quote_id=${q.id} ORDER BY started_at DESC LIMIT 200`,
      sql`SELECT id,view_id,type,data,created_at FROM quote_events WHERE quote_id=${q.id} ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT id,kind,to_phone,status,error,created_at,updated_at FROM whatsapp_messages WHERE quote_id=${q.id} ORDER BY created_at DESC LIMIT 50`,
    ]);
    return json({ ...q, url: proposalUrl(q.token), views, events, messages });
  } catch {
    return json({ error: "Não foi possível carregar o orçamento." }, 503);
  }
}

const patchSchema = z.object({
  payload: quoteSchema.optional(),
  autoReminders: z.boolean().optional(),
  /** Owner sent the link manually (click-to-chat / copy): starts the "not opened" clock. */
  markSent: z.enum(["whatsapp", "copy"]).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const q = await owned(req, ctx);
    if (!q) return json({ error: "Orçamento não encontrado." }, 404);
    const parsed = patchSchema.safeParse(await readJson(req, 50_000));
    if (!parsed.success) return json({ error: "Confira os campos do orçamento." }, 400);
    const { payload, autoReminders, markSent } = parsed.data;
    const sql = db();
    if (payload) {
      if (q.accepted_at) return json({ error: "Este orçamento já foi aprovado pelo paciente. Duplique-o para fazer alterações." }, 409);
      await sql`UPDATE quotes SET payload=${JSON.stringify(payload)}::jsonb,expires_at=${expiresAt(payload.validity).toISOString()},updated_at=now() WHERE id=${q.id}`;
      await sql`INSERT INTO quote_events(quote_id,type) VALUES(${q.id},'edited')`;
    }
    if (autoReminders !== undefined) await sql`UPDATE quotes SET auto_reminders=${autoReminders} WHERE id=${q.id}`;
    if (markSent) {
      await sql`UPDATE quotes SET sent_at=COALESCE(sent_at,now()),updated_at=now() WHERE id=${q.id}`;
      await sql`INSERT INTO quote_events(quote_id,type,data) VALUES(${q.id},'sent',${JSON.stringify({ channel: markSent })}::jsonb)`;
    }
    return json({ id: q.id, token: q.token, url: proposalUrl(q.token) });
  } catch (e) {
    if (e instanceof Error && e.message === "too_large") return json({ error: "Orçamento muito grande." }, 413);
    return json({ error: "Não foi possível salvar. Tente novamente." }, 503);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const q = await owned(req, ctx);
    if (!q) return json({ error: "Orçamento não encontrado." }, 404);
    await db()`DELETE FROM quotes WHERE id=${q.id}`;
    return json({ ok: true });
  } catch {
    return json({ error: "Não foi possível excluir." }, 503);
  }
}
