import { clientIp, currentUser, db, json, readJson, sameOrigin } from "@/lib/db";
import { isExpired, notifyClinic, quoteByToken } from "@/lib/proposals";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ name: z.string().trim().min(3).max(120), agree: z.literal(true), view: z.string().uuid().nullable().optional() });

/** Patient approves the proposal online. Stores name, time, IP, UA and the exact payload approved. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const q = await quoteByToken((await ctx.params).token);
    if (!q) return json({ error: "Orçamento não encontrado." }, 404);
    const parsed = body.safeParse(await readJson(req, 2_000));
    if (!parsed.success) return json({ error: "Informe seu nome completo e confirme que leu o orçamento." }, 400);
    if (q.accepted_at) return json({ error: "Este orçamento já foi aprovado.", acceptedAt: q.accepted_at, acceptedName: q.accepted_name }, 409);
    if (isExpired(q)) return json({ error: "A validade deste orçamento terminou. Fale com a clínica para renová-lo." }, 410);
    const u = await currentUser(req).catch(() => null);
    if (u?.id === q.owner_id) return json({ error: "Você está conectado como a clínica. A aprovação deve ser feita pelo paciente." }, 403);
    const sql = db();
    const rows = await sql`UPDATE quotes SET accepted_at=now(),accepted_name=${parsed.data.name},accepted_ip=${clientIp(req)},
        accepted_user_agent=${(req.headers.get("user-agent") ?? "").slice(0, 300)},accepted_snapshot=payload,updated_at=now()
      WHERE id=${q.id} AND accepted_at IS NULL RETURNING accepted_at`;
    if (!rows[0]) return json({ error: "Este orçamento já foi aprovado." }, 409);
    const view = parsed.data.view ? (await sql`SELECT id FROM quote_views WHERE id=${parsed.data.view} AND quote_id=${q.id}`)[0]?.id ?? null : null;
    await sql`INSERT INTO quote_events(quote_id,view_id,type,data) VALUES(${q.id},${view},'accepted',${JSON.stringify({ name: parsed.data.name })}::jsonb)`;
    await notifyClinic(q, "accepted");
    return json({ ok: true, acceptedAt: rows[0].accepted_at, acceptedName: parsed.data.name });
  } catch {
    return json({ error: "Não foi possível registrar a aprovação. Tente novamente." }, 503);
  }
}
