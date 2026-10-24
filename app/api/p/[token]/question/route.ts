import { db, json, readJson, sameOrigin } from "@/lib/db";
import { notifyClinic, quoteByToken } from "@/lib/proposals";
import { normalizePhone } from "@/lib/phone";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  message: z.string().trim().min(3).max(1000),
  phone: z.string().max(30).optional(),
  view: z.string().uuid().nullable().optional(),
});

/** Patient sends a question / asks to be contacted from the proposal page. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const q = await quoteByToken((await ctx.params).token);
    if (!q) return json({ error: "Orçamento não encontrado." }, 404);
    const parsed = body.safeParse(await readJson(req, 3_000));
    if (!parsed.success) return json({ error: "Escreva sua dúvida (mínimo 3 caracteres)." }, 400);
    const sql = db();
    const recent = await sql`SELECT count(*)::int AS n FROM quote_events WHERE quote_id=${q.id} AND type='question' AND created_at>now()-interval '1 hour'`;
    if (recent[0].n >= 5) return json({ error: "Recebemos suas mensagens. Aguarde o retorno da clínica." }, 429);
    const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
    const view = parsed.data.view ? (await sql`SELECT id FROM quote_views WHERE id=${parsed.data.view} AND quote_id=${q.id}`)[0]?.id ?? null : null;
    await sql`INSERT INTO quote_events(quote_id,view_id,type,data) VALUES(${q.id},${view},'question',${JSON.stringify({ message: parsed.data.message, phone })}::jsonb)`;
    await sql`UPDATE quotes SET updated_at=now() WHERE id=${q.id}`;
    await notifyClinic(q, "question", parsed.data.message);
    return json({ ok: true });
  } catch {
    return json({ error: "Não foi possível enviar agora. Tente novamente." }, 503);
  }
}
