import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { dbReady } from "@/lib/db";
import { quoteByToken } from "@/lib/proposals";
import { quoteSchema } from "@/lib/quote";
import ProposalView from "./proposal-view";
import "./proposal.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

const load = cache(async (token: string) => (dbReady() ? quoteByToken(token).catch(() => null) : null));

// Private document: never indexed; the title shows the clinic only (no patient data in link previews).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const q = await load((await params).token);
  const title = q ? `Seu orçamento · ${q.payload.clinic}` : "Orçamento";
  return {
    title: { absolute: title },
    description: q ? `Plano de tratamento preparado por ${q.payload.clinic}. Veja procedimentos e condições e aprove online.` : undefined,
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title, description: "Veja os procedimentos, as condições de pagamento e aprove online.", type: "website" },
  };
}

export default async function Page({ params }: Props) {
  const { token } = await params;
  const q = await load(token);
  if (!q) notFound();
  const parsed = quoteSchema.safeParse(q.payload); // fills defaults for quotes saved before new fields existed
  const payload = parsed.success ? parsed.data : { ...q.payload, patientPhone: q.payload.patientPhone ?? "", clinicPhone: q.payload.clinicPhone ?? "" };
  return (
    <ProposalView
      token={token}
      quote={payload}
      expiresAt={q.expires_at ? new Date(q.expires_at).toISOString() : null}
      acceptedAt={q.accepted_at ? new Date(q.accepted_at).toISOString() : null}
      acceptedName={q.accepted_name}
      serverNow={new Date().toISOString()}
    />
  );
}
