"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calculate, money, type Quote } from "@/lib/quote";
import {
  duration, engagement, followUps, relative, remaining, SECTIONS, sectionLabel, suggestion,
  TEMPERATURE_LABEL, type Engagement, type Temperature, type ViewStats,
} from "@/lib/engagement";
import { formatPhone, normalizePhone, waLink } from "@/lib/phone";
import "./dashboard.css";

export interface Row {
  id: string; token: string; payload: Quote; created_at: string; updated_at: string;
  sent_at: string | null; expires_at: string | null; accepted_at: string | null; accepted_name: string | null;
  auto_reminders: boolean; views: ViewStats[]; questions: number; contact_clicks: number; wa_status: string | null;
}
interface EventRow { id: string; view_id: string | null; type: string; data: Record<string, unknown>; created_at: string }
interface MessageRow { id: string; kind: string; to_phone: string; status: string; error: string | null; created_at: string; updated_at: string }
interface Detail extends Omit<Row, "views" | "questions" | "contact_clicks" | "wa_status"> {
  url: string; accepted_ip: string | null; views: (ViewStats & { id: string; referrer: string | null })[]; events: EventRow[]; messages: MessageRow[];
}
interface Props {
  whatsappEnabled: boolean;
  focus: string | null;
  onFocus: (id: string | null) => void;
  onEdit: (id: string, token: string, payload: Quote) => void;
  onDuplicate: (payload: Quote) => void;
  onNotice: (msg: string) => void;
}

const linkFor = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/p/${token}`;
const first = (n: string) => n.trim().split(/\s+/)[0] || n;
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const sendText = (q: Quote, url: string) => `Olá, ${first(q.patient)}! Aqui é da ${q.clinic}. Preparamos o seu orçamento odontológico: você pode ver todos os detalhes e aprovar online por este link 👇\n${url}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error ?? "Erro inesperado."), { data: d });
  return d as T;
}

function useTicker(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

/** Polls while the tab is visible. */
function usePolling(fn: () => void, ms: number, deps: unknown[]) {
  useEffect(() => {
    fn();
    const i = setInterval(() => { if (document.visibilityState === "visible") fn(); }, ms);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function Dashboard(props: Props) {
  return props.focus ? <QuoteDetail key={props.focus} id={props.focus} {...props} /> : <QuoteList {...props} />;
}

/* ───────────────────────── List ───────────────────────── */

type Filter = "all" | "live" | "hot" | "not_opened" | "won";

function QuoteList({ onFocus, onNotice }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const now = useTicker(5_000);
  const load = useCallback(() => {
    api<Row[]>("/api/quotes").then(setRows).catch(e => { onNotice(e.message); setRows(r => r ?? []); });
  }, [onNotice]);
  usePolling(load, 15_000, [load]);

  const enriched = useMemo(() => (rows ?? []).map(r => ({
    r, e: engagement({ sentAt: r.sent_at, expiresAt: r.expires_at, acceptedAt: r.accepted_at, questions: r.questions, contactClicks: r.contact_clicks, views: r.views, now }),
  })), [rows, now]);

  const kpi = useMemo(() => {
    const sent = enriched.filter(x => x.r.sent_at || x.e.opens > 0);
    const opened = sent.filter(x => x.e.opens > 0);
    const won = enriched.filter(x => x.r.accepted_at);
    return {
      sent: sent.length,
      openRate: sent.length ? Math.round((opened.length / sent.length) * 100) : 0,
      hot: enriched.filter(x => x.e.temperature === "hot" || x.e.live).length,
      live: enriched.filter(x => x.e.live).length,
      won: won.length,
      wonValue: won.reduce((s, x) => s + calculate(x.r.payload).net, 0),
      pipeline: enriched.filter(x => !x.r.accepted_at && x.e.temperature !== "expired").reduce((s, x) => s + calculate(x.r.payload).net, 0),
    };
  }, [enriched]);

  const visible = enriched.filter(({ r, e }) =>
    (filter === "all" || (filter === "live" ? e.live : filter === "hot" ? e.temperature === "hot" : e.temperature === filter)) &&
    (!query || r.payload.patient.toLowerCase().includes(query.toLowerCase())));

  if (rows === null) return <section className="db-shell"><div className="db-skeleton" /><div className="db-skeleton" /><div className="db-skeleton" /></section>;

  return (
    <section className="db-shell">
      <div className="db-kpis">
        <Kpi label="Orçamentos enviados" value={String(kpi.sent)} hint={`${rows.length} no total`} />
        <Kpi label="Taxa de abertura" value={`${kpi.openRate}%`} hint="dos enviados foram abertos" bar={kpi.openRate} />
        <Kpi label="Leads quentes" value={String(kpi.hot)} hint={kpi.live ? `${kpi.live} vendo agora` : "prontos para contato"} live={kpi.live > 0} />
        <Kpi label="Aprovados" value={money(kpi.wonValue)} hint={`${kpi.won} aprovado(s) · ${money(kpi.pipeline)} em aberto`} accent />
      </div>

      <div className="db-toolbar">
        <div className="db-filters" role="tablist">
          {([["all", "Todos"], ["live", "Vendo agora"], ["hot", "Quentes"], ["not_opened", "Não abertos"], ["won", "Aprovados"]] as [Filter, string][]).map(([f, l]) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "db-filter on" : "db-filter"} onClick={() => setFilter(f)}>{l}</button>
          ))}
        </div>
        <input className="db-search" placeholder="Buscar paciente…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar paciente" />
      </div>

      {visible.length === 0 ? (
        <div className="db-empty"><span>◌</span><p>{rows.length ? "Nenhum orçamento neste filtro." : "Nenhum orçamento salvo ainda. Crie um orçamento e gere o link para começar a acompanhar."}</p></div>
      ) : (
        <ul className="db-list">
          {visible.map(({ r, e }) => (
            <li key={r.id}>
              <button className="db-row" onClick={() => onFocus(r.id)}>
                <span className={`db-avatar t-${e.temperature}`}>{initials(r.payload.patient)}{e.live && <i className="db-live-dot" />}</span>
                <span className="db-row-main">
                  <strong>{r.payload.patient}</strong>
                  <small>{e.live ? <b className="db-live-text">● Vendo agora</b> : e.lastSeenAt ? `Visto ${relative(e.lastSeenAt, now)}` : r.sent_at ? `Enviado ${relative(r.sent_at, now)}` : `Criado ${relative(r.created_at, now)}`}
                    {r.questions > 0 && <em className="db-q">💬 {r.questions} dúvida{r.questions > 1 ? "s" : ""}</em>}</small>
                </span>
                <span className="db-row-stats">
                  <span title="Aberturas">👁 {e.opens}</span>
                  <span title="Tempo de leitura">◷ {duration(e.activeMs)}</span>
                  <span title="Até onde rolou" className="db-mini-bar"><i style={{ width: `${e.maxScroll}%` }} />{e.maxScroll}%</span>
                </span>
                <TempPill t={e.temperature} score={e.score} />
                <span className="db-row-value">{money(calculate(r.payload).net)}</span>
                <span className="db-chev">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kpi({ label, value, hint, bar, live, accent }: { label: string; value: string; hint: string; bar?: number; live?: boolean; accent?: boolean }) {
  return (
    <div className={accent ? "db-kpi db-kpi-accent" : "db-kpi"}>
      <span>{label}{live && <i className="db-live-dot static" />}</span>
      <strong>{value}</strong>
      {bar !== undefined && <div className="db-kpi-bar"><i style={{ width: `${bar}%` }} /></div>}
      <small>{hint}</small>
    </div>
  );
}

function TempPill({ t, score }: { t: Temperature; score: number }) {
  const icon = { won: "✓", expired: "⧗", not_opened: "✉", hot: "🔥", warm: "◐", cold: "❄" }[t];
  return <span className={`db-temp t-${t}`} title={`Score de engajamento: ${score}/100`}>{icon} {TEMPERATURE_LABEL[t]}{["hot", "warm", "cold"].includes(t) && <b>{score}</b>}</span>;
}

/* ───────────────────────── Detail ───────────────────────── */

function QuoteDetail({ id, whatsappEnabled, onFocus, onEdit, onDuplicate, onNotice }: Props & { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState("");
  const now = useTicker(5_000);
  const load = useCallback(() => {
    api<Detail>(`/api/quotes/${id}`).then(setD).catch(e => { onNotice(e.message); onFocus(null); });
  }, [id, onFocus, onNotice]);
  usePolling(load, 10_000, [load]);

  if (!d) return <section className="db-shell"><div className="db-skeleton tall" /></section>;

  const q = d.payload;
  const totals = calculate(q);
  const questions = d.events.filter(e => e.type === "question").length;
  const e = engagement({ sentAt: d.sent_at, expiresAt: d.expires_at, acceptedAt: d.accepted_at, questions, contactClicks: d.events.filter(x => x.type === "contact_click").length, views: d.views, now });
  const s = suggestion(e, { sentAt: d.sent_at, expiresAt: d.expires_at, questions, now });
  const url = linkFor(d.token);
  const installments = totals.balance > 0 ? `${q.months}× de ${money(totals.installment)}` : undefined;
  const msgs = followUps({ patient: q.patient, clinic: q.clinic, link: url, validity: q.validity, installments });
  const suggested = s.messageId ? msgs.find(m => m.id === s.messageId) : null;
  const hasPhone = Boolean(normalizePhone(q.patientPhone));
  const left = d.expires_at ? remaining(d.expires_at, now) : null;
  const sectionTotal = Math.max(1, Object.values(e.sections).reduce((a, b) => a + b, 0));

  async function markSent(channel: "whatsapp" | "copy") {
    if (!d!.sent_at) await api(`/api/quotes/${id}`, { method: "PATCH", body: JSON.stringify({ markSent: channel }) }).catch(() => {});
    load();
  }
  async function sendAuto(kind: "proposal" | "unopened" | "followup" | "expiring" = "proposal") {
    setBusy("send");
    try {
      await api(`/api/quotes/${id}/send`, { method: "POST", body: JSON.stringify({ kind }) });
      onNotice("Mensagem enviada automaticamente pelo WhatsApp. Acompanhe a entrega e a leitura na linha do tempo.");
      load();
    } catch (err) { onNotice(err instanceof Error ? err.message : "Falha no envio."); }
    finally { setBusy(""); }
  }
  function sendManual(text: string) {
    window.open(waLink(hasPhone ? q.patientPhone : "", text), "_blank", "noopener");
    markSent("whatsapp");
  }
  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => {});
    onNotice("Link copiado. Cole no WhatsApp, e-mail ou SMS do paciente.");
    markSent("copy");
  }
  async function toggleReminders() {
    await api(`/api/quotes/${id}`, { method: "PATCH", body: JSON.stringify({ autoReminders: !d!.auto_reminders }) }).catch(err => onNotice(err.message));
    load();
  }
  async function remove() {
    if (!confirm(`Excluir o orçamento de ${q.patient}? O link deixará de funcionar e o histórico de visitas será apagado.`)) return;
    await api(`/api/quotes/${id}`, { method: "DELETE" }).then(() => { onNotice("Orçamento excluído."); onFocus(null); }).catch(err => onNotice(err.message));
  }

  return (
    <section className="db-shell db-detail">
      <button className="db-back" onClick={() => onFocus(null)}>‹ Todos os orçamentos</button>

      <header className="db-head">
        <span className={`db-avatar lg t-${e.temperature}`}>{initials(q.patient)}{e.live && <i className="db-live-dot" />}</span>
        <div className="db-head-main">
          <h2>{q.patient}</h2>
          <p>{money(totals.net)}{installments && ` · ${installments}`} · {q.items.length} procedimento(s)
            {hasPhone && <> · {formatPhone(q.patientPhone)}</>}</p>
          <div className="db-head-tags">
            <TempPill t={e.temperature} score={e.score} />
            {e.live && <span className="db-tag live">● Vendo agora</span>}
            {d.accepted_at ? <span className="db-tag ok">Aprovado {relative(d.accepted_at, now)}</span>
              : left ? <span className="db-tag">⧗ Expira em {left}</span> : d.expires_at && <span className="db-tag warn">Link expirado</span>}
            {d.sent_at ? <span className="db-tag">Enviado {relative(d.sent_at, now)}</span> : <span className="db-tag warn">Ainda não enviado</span>}
          </div>
        </div>
      </header>

      <div className="db-actions">
        {whatsappEnabled && hasPhone
          ? <button className="db-btn wa" disabled={busy === "send"} onClick={() => sendAuto("proposal")}><WaGlyph /> {busy === "send" ? "Enviando…" : d.sent_at ? "Reenviar automático" : "Enviar automático no WhatsApp"}</button>
          : <button className="db-btn wa" onClick={() => sendManual(sendText(q, url))}><WaGlyph /> {hasPhone ? "Enviar no WhatsApp" : "Escolher contato no WhatsApp"}</button>}
        <button className="db-btn" onClick={copy}>⧉ Copiar link</button>
        <a className="db-btn" href={url} target="_blank" rel="noopener noreferrer">↗ Ver como paciente</a>
        {!d.accepted_at && <button className="db-btn" onClick={() => onEdit(d.id, d.token, q)}>✎ Editar</button>}
        <button className="db-btn" onClick={() => onDuplicate(q)}>⎘ Duplicar</button>
        <button className="db-btn danger" onClick={remove} aria-label="Excluir orçamento">🗑</button>
      </div>
      {!hasPhone && <p className="db-hint">Cadastre o WhatsApp do paciente no orçamento para enviar direto para ele{whatsappEnabled ? " e ativar o envio automático" : ""}.</p>}

      <div className="db-grid">
        <div className="db-col">
          <article className={`db-card db-next u-${s.urgency}`}>
            <Gauge score={e.score} t={e.temperature} />
            <div>
              <span className="db-eyebrow">PRÓXIMO PASSO SUGERIDO</span>
              <h3>{s.title}</h3>
              <p>{s.detail}</p>
              {suggested && <button className="db-btn wa sm" onClick={() => sendManual(suggested.text)}><WaGlyph /> Enviar “{suggested.label}”</button>}
            </div>
          </article>

          <div className="db-metrics">
            <Metric label="Aberturas" value={String(e.opens)} sub={e.opens > 1 ? `${new Set(d.views.map(v => v.device)).size} dispositivo(s)` : e.opens ? "1 visita" : "nenhuma ainda"} />
            <Metric label="Tempo de leitura" value={duration(e.activeMs)} sub="atenção real, aba visível" />
            <Metric label="Até onde viu" value={`${e.maxScroll}%`} sub={e.maxScroll >= 90 ? "leu até o final" : "da página"} bar={e.maxScroll} />
            <Metric label="Último acesso" value={e.live ? "Agora" : relative(e.lastSeenAt, now)} sub={e.lastSeenAt ? fmt(e.lastSeenAt.toISOString()) : "—"} live={e.live} />
          </div>

          <article className="db-card">
            <div className="db-card-head"><h3>Mapa de interesse</h3><span>tempo por seção</span></div>
            {e.activeMs === 0 ? <p className="db-muted">Aparece assim que o paciente abrir o orçamento.</p> : (
              <ul className="db-heat">
                {SECTIONS.map(sec => {
                  const v = e.sections[sec.id];
                  const pct = Math.round((v / sectionTotal) * 100);
                  return <li key={sec.id}><span>{sec.label}</span><div><i style={{ width: `${Math.max(pct, v ? 3 : 0)}%` }} /></div><b>{v ? duration(v) : "—"}</b></li>;
                })}
              </ul>
            )}
            {e.sections.pagamento >= 20_000 && <p className="db-insight">💡 Passou {duration(e.sections.pagamento)} nas condições de pagamento — sinal de que está avaliando o valor das parcelas.</p>}
          </article>

          <article className="db-card">
            <div className="db-card-head"><h3>Visitas</h3><span>{d.views.length}</span></div>
            {d.views.length === 0 ? <p className="db-muted">Nenhuma visita ainda.</p> : (
              <ul className="db-visits">
                {d.views.map(v => {
                  const live = now.getTime() - new Date(v.lastSeenAt).getTime() < 35_000;
                  return (
                    <li key={v.id}>
                      <span className={live ? "db-visit-dot live" : "db-visit-dot"} />
                      <div><strong>{fmt(String(v.startedAt))}</strong><small>{v.device ?? "Dispositivo"}{v.referrer && ` · via ${v.referrer}`}</small></div>
                      <span>{duration(v.activeMs)}</span>
                      <span className="db-mini-bar"><i style={{ width: `${v.maxScroll}%` }} />{v.maxScroll}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </div>

        <div className="db-col">
          {d.accepted_at && (
            <article className="db-card db-won">
              <h3>✓ Aprovado online</h3>
              <p><b>{d.accepted_name}</b> aprovou em {new Date(d.accepted_at).toLocaleString("pt-BR")}{d.accepted_ip && ` · IP ${d.accepted_ip}`}.</p>
              <small>O conteúdo exato aprovado fica guardado como comprovante.</small>
            </article>
          )}

          <article className="db-card">
            <div className="db-card-head"><h3>Linha do tempo</h3>{e.live && <span className="db-live-text">● ao vivo</span>}</div>
            <Timeline d={d} />
          </article>

          <article className="db-card">
            <div className="db-card-head"><h3>Mensagens prontas</h3><span>WhatsApp</span></div>
            <ul className="db-msgs">
              {msgs.filter(m => (d.accepted_at ? m.id === "agendar" : m.id !== "agendar")).map(m => (
                <li key={m.id} className={m.id === s.messageId ? "on" : ""}>
                  <div><strong>{m.label}{m.id === s.messageId && <em>sugerida</em>}</strong><p>{m.text}</p></div>
                  <button className="db-icon-btn" title="Abrir no WhatsApp" onClick={() => sendManual(m.text)}><WaGlyph /></button>
                </li>
              ))}
            </ul>
          </article>

          <article className="db-card">
            <div className="db-card-head"><h3>Automação</h3><span className={whatsappEnabled ? "db-ok" : "db-warn"}>{whatsappEnabled ? "API oficial ativa" : "API não configurada"}</span></div>
            <label className="db-switch">
              <input type="checkbox" checked={d.auto_reminders} onChange={toggleReminders} disabled={Boolean(d.accepted_at)} />
              <span className="db-switch-ui" />
              <span><b>Lembretes automáticos</b><small>Não abriu em 24 h · abriu e não decidiu em 48 h · faltam 2 dias para vencer. No máximo 1 de cada, enviados às 9h.</small></span>
            </label>
            {!whatsappEnabled && <p className="db-hint">Configure a WhatsApp Cloud API (veja docs/whatsapp.md) para envio e lembretes 100% automáticos. Enquanto isso, os botões abrem o WhatsApp com a mensagem pronta.</p>}
            {whatsappEnabled && hasPhone && !d.accepted_at && d.sent_at && (
              <div className="db-auto-row">
                <button className="db-btn sm" disabled={!!busy} onClick={() => sendAuto(e.opens ? "followup" : "unopened")}>Enviar lembrete agora</button>
                {left && <button className="db-btn sm" disabled={!!busy} onClick={() => sendAuto("expiring")}>Avisar validade</button>}
              </div>
            )}
            {d.messages.length > 0 && (
              <ul className="db-wa-log">
                {d.messages.map(m => (
                  <li key={m.id} title={m.error ?? undefined}>
                    <span>{({ proposal: "Orçamento", unopened: "Lembrete (não aberto)", followup: "Follow-up", expiring: "Aviso de validade", clinic_accepted: "Aviso à clínica: aprovação", clinic_question: "Aviso à clínica: dúvida" } as Record<string, string>)[m.kind] ?? m.kind}</span>
                    <small>{fmt(m.created_at)}</small>
                    <WaStatus status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, sub, bar, live }: { label: string; value: string; sub: string; bar?: number; live?: boolean }) {
  return (
    <div className="db-metric">
      <span>{label}{live && <i className="db-live-dot static" />}</span>
      <strong>{value}</strong>
      {bar !== undefined && <div className="db-kpi-bar"><i style={{ width: `${bar}%` }} /></div>}
      <small>{sub}</small>
    </div>
  );
}

function Gauge({ score, t }: { score: number; t: Temperature }) {
  const r = 34, c = 2 * Math.PI * r;
  const value = t === "won" ? 100 : t === "not_opened" || t === "expired" ? 0 : score;
  return (
    <div className={`db-gauge t-${t}`}>
      <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r={r} className="track" /><circle cx="40" cy="40" r={r} className="val" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} /></svg>
      <div><strong>{t === "won" ? "✓" : value}</strong><small>{TEMPERATURE_LABEL[t]}</small></div>
    </div>
  );
}

function WaStatus({ status }: { status: string }) {
  const map: Record<string, [string, string]> = { queued: ["◷", "Na fila"], sent: ["✓", "Enviada"], delivered: ["✓✓", "Entregue"], read: ["✓✓", "Lida"], failed: ["!", "Falhou"] };
  const [icon, label] = map[status] ?? ["?", status];
  return <span className={`db-wa-status s-${status}`}>{icon} {label}</span>;
}

const EVENT: Record<string, { icon: string; text: (e: EventRow) => string; tone?: string }> = {
  sent: { icon: "➤", text: e => `Link enviado${e.data.channel === "api" ? " automaticamente pelo WhatsApp" : e.data.channel === "whatsapp" ? " pelo WhatsApp" : e.data.channel === "copy" ? " (link copiado)" : ""}` },
  reminder: { icon: "⟲", text: e => `Lembrete automático enviado (${({ unopened: "não aberto", followup: "follow-up", expiring: "validade" } as Record<string, string>)[String(e.data.kind)] ?? e.data.kind})` },
  wa_read: { icon: "✓✓", text: () => "Leu a mensagem no WhatsApp", tone: "blue" },
  wa_failed: { icon: "!", text: e => `Falha na entrega do WhatsApp${e.data.error ? `: ${e.data.error}` : ""}`, tone: "bad" },
  opened: { icon: "👁", text: e => `${e.data.returning ? "Voltou a abrir" : "Abriu o orçamento"} · ${e.data.device ?? ""}`, tone: "good" },
  read_all: { icon: "⇣", text: () => "Leu até o final da página", tone: "good" },
  contact_click: { icon: "☎", text: () => "Clicou para falar com a clínica no WhatsApp", tone: "hot" },
  question: { icon: "💬", text: e => `Enviou uma dúvida: “${e.data.message}”${e.data.phone ? ` · retorno: ${formatPhone(String(e.data.phone))}` : ""}`, tone: "hot" },
  wa_reply: { icon: "↩", text: e => `Respondeu no WhatsApp: “${e.data.text}”`, tone: "hot" },
  accepted: { icon: "✓", text: e => `Aprovou o orçamento online (${e.data.name})`, tone: "won" },
  edited: { icon: "✎", text: () => "Orçamento editado pela clínica" },
};

function Timeline({ d }: { d: Detail }) {
  const items = [...d.events, { id: "created", view_id: null, type: "created", data: {}, created_at: d.created_at }];
  const durations = new Map(d.views.map(v => [v.id, v]));
  return (
    <ol className="db-timeline">
      {items.map(ev => {
        const meta = EVENT[ev.type] ?? { icon: "•", text: () => (ev.type === "created" ? "Orçamento criado" : ev.type) };
        const v = ev.type === "opened" && ev.view_id ? durations.get(ev.view_id) : undefined;
        return (
          <li key={ev.id} className={meta.tone ? `tone-${meta.tone}` : ""}>
            <span className="db-tl-icon">{meta.icon}</span>
            <div><p>{meta.text(ev)}</p><small>{fmt(ev.created_at)}{v && ` · ficou ${duration(v.activeMs)} · viu ${v.maxScroll}%`}</small></div>
          </li>
        );
      })}
    </ol>
  );
}

function WaGlyph() {
  return <svg className="db-wa-glyph" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>;
}

export type { Engagement };
