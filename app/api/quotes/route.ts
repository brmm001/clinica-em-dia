import { randomBytes } from "node:crypto";
import { currentUser, db, json, proposalUrl, readJson, sameOrigin } from "@/lib/db";
import { expiresAt, quoteSchema } from "@/lib/quote";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner's quotes with raw tracking data; the engagement score is computed client-side so "live" stays fresh. */
export async function GET(req: Request) {
  try {
    const u = await currentUser(req);
    if (!u) return json({ error: "Entre para acessar seus orçamentos." }, 401);
    const rows = await db()`
      SELECT q.id,q.token,q.payload,q.created_at,q.updated_at,q.sent_at,q.expires_at,q.accepted_at,q.accepted_name,q.auto_reminders,
        COALESCE((SELECT json_agg(json_build_object('startedAt',v.started_at,'lastSeenAt',v.last_seen_at,'activeMs',v.active_ms,'maxScroll',v.max_scroll,'sections',v.sections,'device',v.device) ORDER BY v.started_at DESC)
          FROM quote_views v WHERE v.quote_id=q.id),'[]'::json) AS views,
        (SELECT count(*) FROM quote_events e WHERE e.quote_id=q.id AND e.type='question')::int AS questions,
        (SELECT count(*) FROM quote_events e WHERE e.quote_id=q.id AND e.type='contact_click')::int AS contact_clicks,
        (SELECT m.status FROM whatsapp_messages m WHERE m.quote_id=q.id AND m.kind='proposal' ORDER BY m.created_at DESC LIMIT 1) AS wa_status
      FROM quotes q WHERE q.owner_id=${u.id} ORDER BY q.updated_at DESC LIMIT 100`;
    return json(rows);
  } catch {
    return json({ error: "Não foi possível carregar os orçamentos." }, 503);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const u = await currentUser(req);
    if (!u) return json({ error: "Entre para salvar o orçamento." }, 401);
    const parsed = quoteSchema.safeParse(await readJson(req, 50_000));
    if (!parsed.success) return json({ error: "Confira os campos do orçamento." }, 400);
    const token = randomBytes(16).toString("base64url");
    const rows = await db()`INSERT INTO quotes(owner_id,payload,token,expires_at)
      VALUES(${u.id},${JSON.stringify(parsed.data)}::jsonb,${token},${expiresAt(parsed.data.validity).toISOString()}) RETURNING id,token`;
    return json({ ...rows[0], url: proposalUrl(token) }, 201);
  } catch (e) {
    if (e instanceof Error && e.message === "too_large") return json({ error: "Orçamento muito grande." }, 413);
    return json({ error: "Não foi possível salvar. Tente novamente." }, 503);
  }
}
