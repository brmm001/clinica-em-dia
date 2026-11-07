import { z } from "zod";
import { currentUser, db, json, readJson, sameOrigin } from "@/lib/db";
import { opportunitySchema } from "@/lib/gestao";

const fields = opportunitySchema.extend({ id: z.uuid().optional() });

export async function GET(req: Request) {
  try {
    const user = await currentUser(req);
    if (!user) return json({ error: "Entre para acessar a gestão." }, 401);
    const sql = db();
    const [opportunities, quotes] = await Promise.all([
      sql`SELECT id,patient,phone,source,stage,amount_cents,appointment_at,followup_at,quote_id
          FROM clinic_opportunities WHERE owner_id=${user.id} ORDER BY created_at DESC`,
      sql`SELECT id,payload->>'patient' AS patient,created_at
          FROM quotes WHERE owner_id=${user.id} ORDER BY created_at DESC`,
    ]);
    return json({ opportunities, quotes });
  } catch {
    return json({ error: "Não foi possível carregar a gestão. Confira a conexão e a migração do banco." }, 503);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const user = await currentUser(req);
    if (!user) return json({ error: "Entre para salvar a oportunidade." }, 401);
    const body = await readJson(req).catch(() => null);
    const parsed = fields.safeParse(body);
    if (!parsed.success) return json({ error: "Confira os dados da oportunidade." }, 400);
    const sql = db();
    const { id, patient, phone, source, stage, amount_cents, appointment_at, followup_at, quote_id } = parsed.data;
    const rows = id
      ? await sql`UPDATE clinic_opportunities
          SET patient=${patient},phone=${phone},source=${source},stage=${stage},amount_cents=${amount_cents},
              appointment_at=${appointment_at},followup_at=${followup_at},quote_id=${quote_id}
          WHERE id=${id} AND owner_id=${user.id}
          AND (${quote_id}::uuid IS NULL OR EXISTS (SELECT 1 FROM quotes WHERE id=${quote_id} AND owner_id=${user.id}))
          RETURNING id`
      : await sql`INSERT INTO clinic_opportunities
          (owner_id,patient,phone,source,stage,amount_cents,appointment_at,followup_at,quote_id)
          SELECT ${user.id},${patient},${phone},${source},${stage},${amount_cents},${appointment_at},${followup_at},${quote_id}
          WHERE ${quote_id}::uuid IS NULL OR EXISTS (SELECT 1 FROM quotes WHERE id=${quote_id} AND owner_id=${user.id})
          RETURNING id`;
    if (!rows.length) return json({ error: "Oportunidade ou orçamento indisponível." }, 404);
    return json(rows[0], id ? 200 : 201);
  } catch {
    return json({ error: "Não foi possível salvar. Tente novamente." }, 503);
  }
}

export async function DELETE(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: "Origem não permitida." }, 403);
    const user = await currentUser(req);
    if (!user) return json({ error: "Entre para excluir a oportunidade." }, 401);
    const parsed = z.uuid().safeParse(new URL(req.url).searchParams.get("id"));
    if (!parsed.success) return json({ error: "Oportunidade inválida." }, 400);
    const rows = await db()`DELETE FROM clinic_opportunities
      WHERE id=${parsed.data} AND owner_id=${user.id} RETURNING id`;
    return rows.length ? json({ ok: true }) : json({ error: "Oportunidade indisponível." }, 404);
  } catch {
    return json({ error: "Não foi possível excluir. Tente novamente." }, 503);
  }
}
