import { z } from "zod";

export const stages = {
  new: "Novo contato",
  scheduled: "Avaliação agendada",
  evaluated: "Avaliado",
  quoted: "Orçamento enviado",
  followup: "Em negociação",
  won: "Fechado",
  lost: "Perdido",
} as const;

export const stageKeys = Object.keys(stages) as (keyof typeof stages)[];

export const opportunitySchema = z.object({
  patient: z.string().trim().min(2).max(160),
  phone: z.string().regex(/^(?:\d{10,15})?$/),
  source: z.string().trim().max(80),
  stage: z.enum(stageKeys),
  amount_cents: z.number().int().min(0).max(100000000),
  appointment_at: z.iso.datetime().nullable(),
  followup_at: z.iso.datetime().nullable(),
  quote_id: z.uuid().nullable(),
});

export type OpportunityInput = z.infer<typeof opportunitySchema>;
export type Opportunity = OpportunityInput & { id: string };
export type QuoteOption = { id: string; patient: string; created_at: string };
