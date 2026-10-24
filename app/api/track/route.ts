import { currentUser, db, json, readJson } from "@/lib/db";
import { deviceLabel, SECTION_IDS } from "@/lib/engagement";
import { quoteByToken } from "@/lib/proposals";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const token = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const uuid = z.string().uuid();
const ms = z.number().int().min(0).max(86_400_000);
const schema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("start"), token, visitor: z.string().regex(/^[A-Za-z0-9-]{8,64}$/), referrer: z.string().max(300).optional() }),
  z.object({ t: z.literal("beat"), token, view: uuid, active: ms, scroll: z.number().min(0).max(100), sections: z.record(z.enum(SECTION_IDS as [string, ...string[]]), ms) }),
  z.object({ t: z.literal("contact"), token, view: uuid.nullable() }),
]);

/**
 * Public, anonymous tracking endpoint used by /p/[token].
 * Clients send cumulative totals per visit, so duplicated or lost beacons are harmless,
 * and server caps them by the real elapsed time of the visit (no inflated numbers).
 */
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await readJson(req, 4_000));
    if (!parsed.success) return json({ error: "invalid" }, 400);
    const m = parsed.data;
    const sql = db();

    if (m.t === "start") {
      const q = await quoteByToken(m.token);
      if (!q) return json({ error: "not_found" }, 404);
      // The clinic opening its own link must not count as a patient visit.
      const u = await currentUser(req).catch(() => null);
      if (u?.id === q.owner_id) return json({ view: null, owner: true });
      const resumed = await sql`UPDATE quote_views SET last_seen_at=now() WHERE id=(
          SELECT id FROM quote_views WHERE quote_id=${q.id} AND visitor_id=${m.visitor} AND last_seen_at>now()-interval '30 minutes'
          ORDER BY last_seen_at DESC LIMIT 1)
        RETURNING id,active_ms,max_scroll,sections`;
      if (resumed[0]) {
        const r = resumed[0];
        return json({ view: r.id, active: r.active_ms, scroll: r.max_scroll, sections: r.sections });
      }
      const device = deviceLabel(req.headers.get("user-agent"));
      const referrer = m.referrer ? (() => { try { return new URL(m.referrer!).hostname; } catch { return null; } })() : null;
      const ins = await sql`INSERT INTO quote_views(quote_id,visitor_id,device,referrer) VALUES(${q.id},${m.visitor},${device},${referrer}) RETURNING id`;
      const returning = await sql`SELECT count(*)::int AS n FROM quote_views WHERE quote_id=${q.id} AND visitor_id=${m.visitor}`;
      await sql`INSERT INTO quote_events(quote_id,view_id,type,data) VALUES(${q.id},${ins[0].id},'opened',${JSON.stringify({ device, returning: returning[0].n > 1 })}::jsonb)`;
      return json({ view: ins[0].id, active: 0, scroll: 0, sections: {} });
    }

    if (m.t === "beat") {
      const rows = await sql`SELECT v.id,v.quote_id,v.started_at,v.max_scroll,v.active_ms,v.sections FROM quote_views v JOIN quotes q ON q.id=v.quote_id WHERE v.id=${m.view} AND q.token=${m.token}`;
      const v = rows[0];
      if (!v) return json({ error: "not_found" }, 404);
      const cap = Date.now() - new Date(v.started_at).getTime() + 5_000;
      const sections: Record<string, number> = { ...(v.sections as Record<string, number>) };
      for (const [k, val] of Object.entries(m.sections)) sections[k] = Math.max(Number(sections[k] ?? 0), Math.min(val, cap));
      const active = Math.max(v.active_ms, Math.min(m.active, cap));
      const scroll = Math.max(v.max_scroll, Math.round(m.scroll));
      await sql`UPDATE quote_views SET last_seen_at=now(),active_ms=${active},max_scroll=${scroll},sections=${JSON.stringify(sections)}::jsonb WHERE id=${v.id}`;
      if (v.max_scroll < 90 && scroll >= 90) await sql`INSERT INTO quote_events(quote_id,view_id,type) VALUES(${v.quote_id},${v.id},'read_all')`;
      return json({ ok: true });
    }

    const q = await quoteByToken(m.token);
    if (!q) return json({ error: "not_found" }, 404);
    const own = m.view ? await sql`SELECT id FROM quote_views WHERE id=${m.view} AND quote_id=${q.id}` : [];
    await sql`INSERT INTO quote_events(quote_id,view_id,type) VALUES(${q.id},${own[0]?.id ?? null},'contact_click')`;
    return json({ ok: true });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
