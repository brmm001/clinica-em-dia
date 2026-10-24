import { db, json } from "@/lib/db";
import { sendToPatient, type PatientKind, type QuoteRow } from "@/lib/proposals";
import { whatsappReady } from "@/lib/whatsapp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily automatic reminders (vercel.json cron). Each kind is sent at most once per quote,
 * never twice to the same quote in 24 h, and only when the owner left auto reminders on.
 *  - unopened: sent > 24 h ago and never opened
 *  - followup: opened > 48 h ago, idle for 24 h, not approved
 *  - expiring: validity ends within 2 days
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (!whatsappReady()) return json({ skipped: "whatsapp_not_configured" });
  const sql = db();
  const base = (kind: PatientKind) => sql`
    SELECT q.id,q.owner_id,q.token,q.payload,q.created_at,q.updated_at,q.sent_at,q.expires_at,q.accepted_at,q.accepted_name,q.auto_reminders
    FROM quotes q
    WHERE q.auto_reminders AND q.accepted_at IS NULL AND q.sent_at IS NOT NULL AND q.expires_at>now()
      AND COALESCE(q.payload->>'patientPhone','')<>''
      AND NOT EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.quote_id=q.id AND m.kind=${kind})
      AND NOT EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.quote_id=q.id AND m.created_at>now()-interval '24 hours')
      AND CASE ${kind}::text
        WHEN 'unopened' THEN q.sent_at<now()-interval '24 hours' AND NOT EXISTS (SELECT 1 FROM quote_views v WHERE v.quote_id=q.id)
        WHEN 'followup' THEN (SELECT min(v.started_at) FROM quote_views v WHERE v.quote_id=q.id)<now()-interval '48 hours'
                         AND (SELECT max(v.last_seen_at) FROM quote_views v WHERE v.quote_id=q.id)<now()-interval '24 hours'
        WHEN 'expiring' THEN q.expires_at<now()+interval '2 days'
        ELSE false END
    ORDER BY q.sent_at LIMIT 40`;

  const done = new Set<string>();
  const report: { id: string; kind: PatientKind; ok: boolean; error?: string }[] = [];
  for (const kind of ["expiring", "unopened", "followup"] as PatientKind[]) {
    for (const q of (await base(kind)) as QuoteRow[]) {
      if (done.has(q.id)) continue;
      done.add(q.id);
      try { await sendToPatient(q, kind); report.push({ id: q.id, kind, ok: true }); }
      catch (e) { report.push({ id: q.id, kind, ok: false, error: e instanceof Error ? e.message : "erro" }); }
    }
  }
  return json({ sent: report.filter(r => r.ok).length, report });
}
