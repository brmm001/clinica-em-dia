"use client";

import Link from "next/link";
import { waLink } from "@/lib/phone";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { stageKeys, stages, type Opportunity, type OpportunityInput, type QuoteOption } from "@/lib/gestao";

const empty: OpportunityInput = {
  patient: "", phone: "", source: "", stage: "new", amount_cents: 0,
  appointment_at: null, followup_at: null, quote_id: null,
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const isOpen = (item: Opportunity) => item.stage !== "won" && item.stage !== "lost";

function localTime(value: string | null) {
  if (!value) return "";
  const instant = new Date(value);
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function Workspace() {
  const [records, setRecords] = useState<Opportunity[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [editing, setEditing] = useState<OpportunityInput | Opportunity | null>(null);
  const [tab, setTab] = useState<"funil" | "agenda">("funil");
  const [state, setState] = useState<"loading" | "signed-out" | "ready" | "failed">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/gestao", { cache: "no-store" });
      if (response.status === 401) {
        setState("signed-out");
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRecords(data.opportunities);
      setQuotes(data.quotes);
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a gestão.");
      setState("failed");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate(input: OpportunityInput | Opportunity, remove = false) {
    setBusy(true);
    setError("");
    try {
      const url = remove && "id" in input ? `/api/gestao?id=${input.id}` : "/api/gestao";
      const response = await fetch(url, remove ? { method: "DELETE" } : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A operação falhou.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    const instant = (name: string) => field(name) ? new Date(field(name)).toISOString() : null;
    void mutate({
      ...editing, patient: field("patient"), phone: field("phone").replace(/\D/g, ""),
      source: field("source"), stage: field("stage") as OpportunityInput["stage"],
      amount_cents: Math.round(Number(field("amount")) * 100),
      appointment_at: instant("appointment"), followup_at: instant("followup"),
      quote_id: field("quote") || null,
    });
  }

  if (state === "loading") return <p>Carregando gestão…</p>;
  if (state === "signed-out") return <><h1>Gestão e CRM</h1><p>Entre na sua conta para acompanhar sua agenda e seus orçamentos.</p><Link className="cta" href="/entrar">Entrar</Link></>;
  if (state === "failed") return <><h1>Gestão e CRM</h1><p role="alert">{error}</p><button onClick={() => { setState("loading"); void load(); }}>Tentar novamente</button></>;

  const open = records.filter(isOpen);
  const now = Date.now();
  const due = open.filter(item => item.followup_at && Date.parse(item.followup_at) <= now);
  const total = (items: Opportunity[]) => money.format(items.reduce((sum, item) => sum + item.amount_cents, 0) / 100);
  const agenda = records.flatMap(item => [
    ...(item.appointment_at ? [{ item, when: item.appointment_at, label: "Avaliação" }] : []),
    ...(isOpen(item) && item.followup_at ? [{ item, when: item.followup_at, label: "Retorno comercial" }] : []),
  ]).sort((a, b) => Date.parse(a.when) - Date.parse(b.when));

  return <>
    <div className="clinic-heading">
      <div><p className="eyebrow">CLÍNICA EM DIA</p><h1>Gestão e CRM</h1><p>Da primeira conversa ao fechamento do tratamento.</p></div>
      <button className="cta" onClick={() => setEditing({ ...empty })}>Nova oportunidade</button>
    </div>
    <dl className="clinic-metrics">
      <div><dt>Em aberto</dt><dd>{open.length}</dd></div>
      <div><dt>Valor em negociação</dt><dd>{total(open)}</dd></div>
      <div><dt>Valor fechado</dt><dd>{total(records.filter(item => item.stage === "won"))}</dd></div>
      <div><dt>Retornos vencidos</dt><dd>{due.length}</dd></div>
    </dl>
    {error && <p role="alert" className="clinic-error">{error}</p>}
    {editing && <form key={"id" in editing ? editing.id : "new"} className="clinic-form" onSubmit={save}>
      <h2>{"id" in editing ? "Editar oportunidade" : "Nova oportunidade"}</h2>
      <div className="clinic-fields">
        <label>Paciente<input name="patient" required minLength={2} maxLength={160} defaultValue={editing.patient} /></label>
        <label>WhatsApp com DDD<input name="phone" type="tel" maxLength={22} defaultValue={editing.phone} placeholder="(41) 99999-9999" /></label>
        <label>Origem<input name="source" maxLength={80} defaultValue={editing.source} placeholder="Indicação, Google, Instagram…" /></label>
        <label>Etapa<select name="stage" defaultValue={editing.stage}>{stageKeys.map(key => <option key={key} value={key}>{stages[key]}</option>)}</select></label>
        <label>Valor negociado (R$)<input name="amount" type="number" min={0} max={1000000} step="0.01" defaultValue={editing.amount_cents / 100} required /></label>
        <label>Orçamento vinculado<select name="quote" defaultValue={editing.quote_id ?? ""}><option value="">Selecionar depois</option>{quotes.map(quote => <option key={quote.id} value={quote.id}>{quote.patient} · {date.format(new Date(quote.created_at))}</option>)}</select></label>
        <label>Data da avaliação<input name="appointment" type="datetime-local" defaultValue={localTime(editing.appointment_at)} /></label>
        <label>Próximo retorno<input name="followup" type="datetime-local" defaultValue={localTime(editing.followup_at)} /></label>
      </div>
      <div className="clinic-actions">
        <button className="cta" disabled={busy}>Salvar</button>
        <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
        {"id" in editing && <button type="button" disabled={busy} onClick={() => { if (window.confirm("Excluir esta oportunidade da gestão?")) void mutate(editing, true); }}>Excluir oportunidade</button>}
      </div>
    </form>}
    <nav className="clinic-actions" aria-label="Modo de visualização">
      <button aria-pressed={tab === "funil"} onClick={() => setTab("funil")}>Funil comercial</button>
      <button aria-pressed={tab === "agenda"} onClick={() => setTab("agenda")}>Agenda e retornos</button>
    </nav>
    {tab === "funil" ? <div className="clinic-board" aria-label="Etapas do funil">
      {stageKeys.map(key => {
        const items = records.filter(item => item.stage === key);
        return <section key={key}><h2>{stages[key]} <span>{items.length}</span></h2>
          {!items.length && <p className="clinic-muted">Nenhuma oportunidade.</p>}
          {items.map(item => <article key={item.id}>
            <button className="clinic-card-title" onClick={() => setEditing(item)}>{item.patient}</button>
            <strong>{money.format(item.amount_cents / 100)}</strong>
            {item.source && <span>{item.source}</span>}
            {item.quote_id && <span>Orçamento vinculado</span>}
            {item.phone && <a href={waLink(item.phone, "")} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>}
          </article>)}
        </section>;
      })}
    </div> : <section className="clinic-agenda">
      <h2>Agenda e retornos</h2>
      {!agenda.length && <p>Nenhuma avaliação ou retorno agendado.</p>}
      {agenda.map(({ item, when, label }) => <div key={`${item.id}-${label}`}>
        <time dateTime={when}>{date.format(new Date(when))}</time>
        <span>{label}</span>
        <button onClick={() => setEditing(item)}>{item.patient}</button>
      </div>)}
    </section>}
  </>;
}
