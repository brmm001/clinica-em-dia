// Pure engagement logic shared by the dashboard, the API and the tests (no I/O here).

export const SECTIONS = [
  { id: 'resumo', label: 'Resumo e valor total' },
  { id: 'procedimentos', label: 'Procedimentos' },
  { id: 'pagamento', label: 'Condições de pagamento' },
  { id: 'observacoes', label: 'Observações' },
  { id: 'aprovacao', label: 'Aprovação' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];
export const SECTION_IDS = SECTIONS.map(s => s.id) as SectionId[];
export const sectionLabel = (id: string) => SECTIONS.find(s => s.id === id)?.label ?? id;

/** Visitor counts as "viewing now" if a heartbeat arrived within this window (heartbeat every 10s). */
export const LIVE_WINDOW_MS = 35_000;

export interface ViewStats {
  startedAt: string | Date;
  lastSeenAt: string | Date;
  activeMs: number;
  maxScroll: number;
  sections: Partial<Record<string, number>>;
  device?: string | null;
}

export interface EngagementInput {
  sentAt?: string | Date | null;
  expiresAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  questions?: number;
  contactClicks?: number;
  views: ViewStats[];
  now?: Date;
}

export type Temperature = 'won' | 'expired' | 'not_opened' | 'hot' | 'warm' | 'cold';

export interface Engagement {
  temperature: Temperature;
  score: number;
  opens: number;
  activeMs: number;
  maxScroll: number;
  sections: Record<SectionId, number>;
  lastSeenAt: Date | null;
  live: boolean;
}

const t = (v: string | Date | null | undefined) => (v ? new Date(v).getTime() : null);
const H = 3_600_000;

export function engagement(input: EngagementInput): Engagement {
  const now = (input.now ?? new Date()).getTime();
  const views = input.views;
  const sections = Object.fromEntries(SECTION_IDS.map(id => [id, 0])) as Record<SectionId, number>;
  let activeMs = 0, maxScroll = 0, last: number | null = null;
  for (const v of views) {
    activeMs += v.activeMs;
    maxScroll = Math.max(maxScroll, v.maxScroll);
    const seen = t(v.lastSeenAt)!;
    if (last === null || seen > last) last = seen;
    for (const id of SECTION_IDS) sections[id] += Number(v.sections[id] ?? 0);
  }
  const opens = views.length;
  const live = last !== null && now - last < LIVE_WINDOW_MS;

  let score = 0;
  if (opens > 0) {
    score += 20;
    score += Math.min(opens - 1, 4) * 6;
    score += Math.min(activeMs / 180_000, 1) * 20;
    score += maxScroll >= 90 ? 10 : maxScroll >= 50 ? 5 : 0;
    if (sections.pagamento >= 20_000) score += 12;
    if (sections.procedimentos >= 30_000) score += 6;
    if ((input.questions ?? 0) > 0) score += 15;
    if ((input.contactClicks ?? 0) > 0) score += 10;
    if (last !== null && now - last < 24 * H) score += 8;
    if (last !== null && now - last > 5 * 24 * H) score -= 15;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const expired = t(input.expiresAt) !== null && now > t(input.expiresAt)!;
  const temperature: Temperature = input.acceptedAt ? 'won'
    : expired ? 'expired'
    : opens === 0 ? 'not_opened'
    : score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cold';

  return { temperature, score, opens, activeMs, maxScroll, sections, lastSeenAt: last === null ? null : new Date(last), live };
}

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  won: 'Aprovado', expired: 'Expirado', not_opened: 'Não aberto', hot: 'Quente', warm: 'Morno', cold: 'Frio',
};

export interface MessageContext { patient: string; clinic: string; link: string; validity: string; installments?: string }
export interface Suggestion { title: string; detail: string; messageId: FollowUpId | null; urgency: 'now' | 'today' | 'soon' | 'wait' | 'done' }

export type FollowUpId = 'reenvio' | 'duvida' | 'pagamento' | 'validade' | 'renovar' | 'agendar' | 'agora';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const brDate = (iso: string) => iso.split('-').reverse().join('/');

/** Ready-to-send WhatsApp messages written from the clinic to the patient. */
export function followUps(c: MessageContext): { id: FollowUpId; label: string; text: string }[] {
  const n = firstName(c.patient);
  return [
    { id: 'agora', label: 'Está vendo agora', text: `Oi, ${n}! Aqui é da ${c.clinic}. Vi que você está olhando o seu orçamento 😊 Se quiser, posso tirar qualquer dúvida agora mesmo por aqui.` },
    { id: 'reenvio', label: 'Reenviar link', text: `Oi, ${n}! Tudo bem? Aqui é da ${c.clinic}. Estou reenviando o seu orçamento para você ver com calma: ${c.link}` },
    { id: 'duvida', label: 'Ficou alguma dúvida?', text: `Oi, ${n}! Vi que você abriu o seu orçamento. Ficou alguma dúvida sobre o tratamento? Estou à disposição para explicar cada etapa. ${c.link}` },
    { id: 'pagamento', label: 'Condições de pagamento', text: `Oi, ${n}! Sobre as condições de pagamento do seu orçamento${c.installments ? ` (${c.installments})` : ''}: se precisar, conseguimos ajustar a entrada ou o número de parcelas. Quer conversar? ${c.link}` },
    { id: 'validade', label: 'Validade acabando', text: `Oi, ${n}! Passando para lembrar que as condições do seu orçamento valem até ${brDate(c.validity)}. Você pode aprovar online pelo link: ${c.link}` },
    { id: 'renovar', label: 'Renovar orçamento', text: `Oi, ${n}! O prazo do seu orçamento venceu, mas podemos renová-lo para você. Quer que eu envie uma versão atualizada?` },
    { id: 'agendar', label: 'Agendar início', text: `Oi, ${n}! Recebemos a aprovação do seu orçamento 🎉 Vamos agendar a primeira consulta? Quais dias e horários ficam melhores para você?` },
  ];
}

export function suggestion(e: Engagement, ctx: { sentAt?: string | Date | null; expiresAt?: string | Date | null; questions?: number; now?: Date }): Suggestion {
  const now = (ctx.now ?? new Date()).getTime();
  const sentAgo = t(ctx.sentAt) === null ? null : now - t(ctx.sentAt)!;
  const toExpire = t(ctx.expiresAt) === null ? null : t(ctx.expiresAt)! - now;
  if (e.temperature === 'won') return { title: 'Agende o início do tratamento', detail: 'O paciente aprovou online. Confirme a primeira consulta enquanto a decisão está fresca.', messageId: 'agendar', urgency: 'done' };
  if (e.temperature === 'expired') return { title: 'Ofereça renovar o orçamento', detail: 'A validade terminou. Uma versão atualizada costuma reabrir a conversa.', messageId: 'renovar', urgency: 'soon' };
  if (e.live) return { title: 'O paciente está vendo agora', detail: 'Melhor momento para uma mensagem curta e humana: ele está com o orçamento aberto.', messageId: 'agora', urgency: 'now' };
  if ((ctx.questions ?? 0) > 0) return { title: 'Responda a dúvida do paciente', detail: 'Há uma pergunta enviada pela página. Responder rápido aumenta muito a chance de aprovação.', messageId: 'duvida', urgency: 'now' };
  if (e.temperature === 'not_opened') {
    if (sentAgo === null) return { title: 'Envie o link ao paciente', detail: 'O orçamento ainda não foi enviado. Mande pelo WhatsApp para começar a acompanhar.', messageId: null, urgency: 'today' };
    if (sentAgo < 24 * H) return { title: 'Aguarde a primeira abertura', detail: 'Enviado há menos de 24 h. Se não abrir até amanhã, reenvie o link.', messageId: null, urgency: 'wait' };
    return { title: 'Reenvie o link', detail: 'Enviado há mais de 24 h e ainda não aberto. Um lembrete gentil costuma resolver.', messageId: 'reenvio', urgency: 'today' };
  }
  if (toExpire !== null && toExpire < 2 * 24 * H) return { title: 'Avise que a validade está acabando', detail: 'Faltam menos de 2 dias. Lembre o prazo e reforce que a aprovação é online.', messageId: 'validade', urgency: 'today' };
  if (e.temperature === 'hot') {
    const pay = e.sections.pagamento >= 20_000;
    return { title: 'Lead quente: faça contato hoje', detail: pay ? 'Passou bastante tempo nas condições de pagamento. Ofereça ajustar entrada ou parcelas.' : 'Abriu várias vezes e leu com atenção. Pergunte se ficou alguma dúvida.', messageId: pay ? 'pagamento' : 'duvida', urgency: 'today' };
  }
  if (e.temperature === 'warm') return { title: 'Follow-up em até 24 h', detail: 'Demonstrou interesse, mas ainda não decidiu. Uma mensagem oferecendo ajuda ajuda a destravar.', messageId: 'duvida', urgency: 'soon' };
  return { title: 'Reforce o valor do tratamento', detail: 'Abriu rapidamente e saiu. Explique os benefícios e convide para conversar.', messageId: 'duvida', urgency: 'soon' };
}

/** Short device label from a User-Agent, e.g. "iPhone · Safari". No fingerprinting, just a readable summary. */
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua ?? '';
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? (/Mobile/.test(s) ? 'Android' : 'Tablet Android')
    : /Windows/.test(s) ? 'Windows' : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : 'Dispositivo';
  const browser = /WhatsApp/i.test(s) ? 'WhatsApp' : /Instagram/.test(s) ? 'Instagram' : /EdgA?\//.test(s) ? 'Edge' : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /CriOS|Chrome\//.test(s) ? 'Chrome' : /FxiOS|Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Navegador';
  return `${os} · ${browser}`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
}

export function relative(date: string | Date | null | undefined, now = new Date()): string {
  if (!date) return '—';
  const diff = now.getTime() - new Date(date).getTime();
  if (diff < 60_000) return 'agora';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/** "3 dias e 4 h" style countdown; null when already expired. */
export function remaining(until: string | Date, now = new Date()): string | null {
  const ms = new Date(until).getTime() - now.getTime();
  if (ms <= 0) return null;
  const d = Math.floor(ms / (24 * H)), h = Math.floor((ms % (24 * H)) / H), m = Math.floor((ms % H) / 60_000);
  if (d > 0) return `${d} ${d === 1 ? 'dia' : 'dias'} e ${h} h`;
  if (h > 0) return `${h} h e ${m} min`;
  return `${Math.max(m, 1)} min`;
}
