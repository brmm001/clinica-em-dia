"use client";
import { useEffect, useState } from "react";
import { calculate, money, type Quote } from "@/lib/quote";
import { remaining } from "@/lib/engagement";
import { formatPhone, normalizePhone, waLink } from "@/lib/phone";
import { useProposalTracking } from "./use-tracking";

interface Props { token: string; quote: Quote; expiresAt: string | null; acceptedAt: string | null; acceptedName: string | null; serverNow: string }

const first = (n: string) => n.trim().split(/\s+/)[0] || n;
const initials = (n: string) => n.trim().split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "C";
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const dateTime = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function useNow(initial: string, every = 30_000) {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => { setNow(new Date()); const i = setInterval(() => setNow(new Date()), every); return () => clearInterval(i); }, [every]);
  return now;
}

export default function ProposalView({ token, quote: q, expiresAt, acceptedAt, acceptedName, serverNow }: Props) {
  const { view, owner, contact } = useProposalTracking(token);
  const now = useNow(serverNow);
  const totals = calculate(q);
  const [accepted, setAccepted] = useState(acceptedAt ? { at: acceptedAt, name: acceptedName ?? "" } : null);
  const left = expiresAt ? remaining(expiresAt, now) : "∞";
  const expired = !accepted && expiresAt !== null && left === null;
  const urgent = expiresAt !== null && new Date(expiresAt).getTime() - now.getTime() < 3 * 86_400_000;
  const clinicWa = normalizePhone(q.clinicPhone) ? waLink(q.clinicPhone, `Olá! Sou ${q.patient} e estou vendo o meu orçamento. Tenho uma dúvida:`) : null;

  if (expired) {
    return (
      <div className="pv pv-expired-page">
        {owner && <OwnerBanner />}
        <div className="pv-expired">
          <span className="pv-mono pv-mono-lg">{initials(q.clinic)}</span>
          <span className="pv-eyebrow">{q.clinic}</span>
          <div className="pv-expired-icon" aria-hidden>⧗</div>
          <h1>Este orçamento expirou</h1>
          <p>As condições eram válidas até <b>{brDate(q.validity)}</b>. Fale com a clínica para receber uma versão atualizada do seu plano de tratamento.</p>
          {clinicWa && <a className="pv-btn pv-btn-wa" href={waLink(q.clinicPhone, `Olá! Sou ${q.patient}. Meu orçamento expirou, poderiam enviar uma versão atualizada?`)} target="_blank" rel="noopener noreferrer" onClick={contact}><WaIcon /> Falar com a clínica</a>}
        </div>
      </div>
    );
  }

  return (
    <div className="pv">
      {owner && <OwnerBanner />}
      <header className="pv-hero" data-track="resumo">
        <div className="pv-glow pv-glow-a" /><div className="pv-glow pv-glow-b" />
        <div className="pv-wrap pv-hero-inner">
          <div className="pv-clinic pv-rise">
            <span className="pv-mono">{initials(q.clinic)}</span>
            <div><strong>{q.clinic}</strong>{(q.professional || q.cro) && <small>{q.professional}{q.cro && ` · CRO ${q.cro}`}</small>}</div>
          </div>
          <div className="pv-hero-grid">
            <div className="pv-rise pv-d1">
              <span className="pv-eyebrow pv-eyebrow-light">PLANO DE TRATAMENTO</span>
              <h1>Olá, {first(q.patient)}.<br /><em>Seu orçamento está pronto.</em></h1>
              <p className="pv-lead">Preparamos cada etapa do seu tratamento com transparência. Revise os procedimentos e as condições com calma — e aprove online quando se sentir seguro.</p>
              <div className="pv-chips">
                <span className="pv-chip">{q.items.length} {q.items.length === 1 ? "procedimento" : "procedimentos"}</span>
                {accepted ? <span className="pv-chip pv-chip-ok">✓ Aprovado</span>
                  : expiresAt && <span className={urgent ? "pv-chip pv-chip-warn" : "pv-chip"}><span className="pv-dot" />Válido por mais {left}</span>}
              </div>
            </div>
            <div className="pv-total pv-rise pv-d2">
              <span>Total do tratamento</span>
              <strong>{money(totals.net)}</strong>
              {q.discount > 0 && <s>{money(totals.gross)}</s>}
              {totals.balance > 0 ? (
                <div className="pv-total-inst">
                  {totals.entry > 0 && <small>Entrada de {money(totals.entry)} +</small>}
                  <b>{q.months}× de {money(totals.installment)}</b>
                  <small>{q.interest ? `${q.interest}% de juros ao mês` : "sem juros"}</small>
                </div>
              ) : <div className="pv-total-inst"><b>Pagamento à vista</b></div>}
              {!accepted && <a href="#aprovacao" className="pv-btn pv-btn-primary">Aprovar orçamento</a>}
              <a href="#duvidas" className="pv-link">Tenho uma dúvida →</a>
            </div>
          </div>
        </div>
      </header>

      <main className="pv-wrap pv-main">
        <section className="pv-card pv-rise pv-d3" data-track="procedimentos">
          <div className="pv-card-head"><span className="pv-step">01</span><h2>Procedimentos</h2><span className="pv-muted">{q.items.length} {q.items.length === 1 ? "item" : "itens"}</span></div>
          <ul className="pv-items">
            {q.items.map((i, n) => (
              <li key={n}>
                <span className="pv-item-n">{String(n + 1).padStart(2, "0")}</span>
                <div className="pv-item-main"><strong>{i.description}</strong><small>{i.tooth && <span className="pv-tooth">Dente / região {i.tooth}</span>}{i.quantity > 1 && <span>{i.quantity} × {money(i.price)}</span>}</small></div>
                <span className="pv-item-price">{money(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="pv-sum">
            <div><dt>Subtotal</dt><dd>{money(totals.gross)}</dd></div>
            {q.discount > 0 && <div className="pv-sum-discount"><dt>Desconto de {q.discount}%</dt><dd>− {money(totals.gross - totals.net)}</dd></div>}
            <div className="pv-sum-total"><dt>Total do tratamento</dt><dd>{money(totals.net)}</dd></div>
          </dl>
        </section>

        <section className="pv-card pv-rise pv-d4" data-track="pagamento">
          <div className="pv-card-head"><span className="pv-step">02</span><h2>Condições de pagamento</h2></div>
          <div className="pv-pay">
            <div className="pv-pay-tile"><span>Entrada</span><strong>{money(totals.entry)}</strong></div>
            <div className="pv-pay-tile pv-pay-hl"><span>{totals.balance > 0 ? "Parcelas" : "Saldo"}</span><strong>{totals.balance > 0 ? `${q.months}× ${money(totals.installment)}` : "Quitado"}</strong></div>
            <div className="pv-pay-tile"><span>Juros</span><strong>{q.interest ? `${q.interest}% a.m.` : "Sem juros"}</strong></div>
            <div className="pv-pay-tile"><span>Total a pagar</span><strong>{money(totals.total)}</strong></div>
          </div>
          {totals.balance > 0 && (
            <div className="pv-plan" aria-label="Cronograma de pagamento">
              {totals.entry > 0 && <span className="pv-plan-entry" title={`Entrada ${money(totals.entry)}`}>Entrada</span>}
              {Array.from({ length: Math.min(q.months, 36) }, (_, i) => <span key={i} title={`${i + 1}ª parcela · ${money(totals.installment)}`} style={{ animationDelay: `${i * 25}ms` }} />)}
            </div>
          )}
          <p className="pv-fine">Simulação pela tabela Price. Pode haver ajuste de centavos na última parcela. Não representa aprovação ou oferta de crédito.</p>
        </section>

        {q.notes && (
          <section className="pv-card pv-rise" data-track="observacoes">
            <div className="pv-card-head"><span className="pv-step">03</span><h2>Observações da clínica</h2></div>
            <p className="pv-notes">{q.notes}</p>
          </section>
        )}

        <div data-track="aprovacao" className="pv-close">
          <section id="aprovacao" className="pv-card pv-approve">
            {accepted ? <Approved name={accepted.name} at={accepted.at} clinic={q.clinic} />
              : <ApproveForm token={token} patient={q.patient} viewId={() => view.current} total={money(totals.net)} onDone={setAccepted} />}
          </section>
          <section id="duvidas" className="pv-card pv-help">
            <h2>Ficou com alguma dúvida?</h2>
            <p className="pv-muted">É normal ter perguntas antes de decidir. Fale com a equipe da {q.clinic}.</p>
            {clinicWa && <a className="pv-btn pv-btn-wa" href={clinicWa} target="_blank" rel="noopener noreferrer" onClick={contact}><WaIcon /> Conversar no WhatsApp{q.clinicPhone && <small>{formatPhone(q.clinicPhone)}</small>}</a>}
            <QuestionForm token={token} viewId={() => view.current} defaultPhone={q.patientPhone} divider={Boolean(clinicWa)} />
          </section>
        </div>

        <footer className="pv-foot">
          <button type="button" className="pv-link" onClick={() => window.print()}>↓ Baixar / imprimir PDF</button>
          <p>Validade: {brDate(q.validity)} · Documento gerado por {q.clinic} com Clínica em Dia.</p>
          <p className="pv-privacy">Para acompanhar seu atendimento, a clínica é avisada quando este orçamento é aberto e por quanto tempo foi visualizado. Não coletamos dados de outros sites. <a href="/privacidade">Privacidade</a></p>
        </footer>
      </main>

      {!accepted && (
        <div className="pv-sticky">
          <div><small>Total</small><strong>{money(totals.net)}</strong>{totals.balance > 0 && <span>{q.months}× {money(totals.installment)}</span>}</div>
          <a href="#aprovacao" className="pv-btn pv-btn-primary">Aprovar</a>
        </div>
      )}
    </div>
  );
}

function OwnerBanner() {
  return <div className="pv-owner">👁 Você está conectado como a clínica — esta visita <b>não</b> entra nas métricas do paciente.</div>;
}

function ApproveForm({ token, patient, total, viewId, onDone }: { token: string; patient: string; total: string; viewId: () => string | null; onDone: (a: { at: string; name: string }) => void }) {
  const [name, setName] = useState(patient);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) { setError("Confirme que leu e concorda com o plano e as condições."); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/p/${token}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, agree: true, view: viewId() }) });
      const d = await r.json();
      if (r.ok || r.status === 409 && d.acceptedAt) onDone({ at: d.acceptedAt, name: d.acceptedName ?? name });
      else setError(d.error ?? "Não foi possível aprovar.");
    } catch { setError("Sem conexão. Tente novamente."); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="pv-form">
      <span className="pv-eyebrow">PRÓXIMO PASSO</span>
      <h2>Aprove seu orçamento online</h2>
      <p className="pv-muted">Ao aprovar, a clínica é avisada na hora e entra em contato para agendar o início do tratamento.</p>
      <label>Nome completo<input value={name} onChange={e => setName(e.target.value)} required minLength={3} maxLength={120} autoComplete="name" /></label>
      <label className="pv-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>Li e concordo com o plano de tratamento e as condições de pagamento apresentadas (total de {total}).</span></label>
      {error && <p className="pv-error" role="alert">{error}</p>}
      <button className="pv-btn pv-btn-primary" disabled={busy}>{busy ? "Registrando…" : "Aprovar orçamento"}</button>
      <small className="pv-fine">Registramos seu nome, data e hora da aprovação como comprovante.</small>
    </form>
  );
}

function Approved({ name, at, clinic }: { name: string; at: string; clinic: string }) {
  return (
    <div className="pv-approved">
      <div className="pv-check-anim" aria-hidden><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-15" /></svg></div>
      <h2>Orçamento aprovado!</h2>
      <p>Aprovado por <b>{name}</b> em {dateTime(at)}.</p>
      <p className="pv-muted">A equipe da {clinic} já foi avisada e vai falar com você para agendar o início do tratamento.</p>
    </div>
  );
}

function QuestionForm({ token, viewId, defaultPhone, divider }: { token: string; viewId: () => string | null; defaultPhone: string; divider: boolean }) {
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState(defaultPhone);
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState("busy"); setError("");
    try {
      const r = await fetch(`/api/p/${token}/question`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, phone: phone || undefined, view: viewId() }) });
      const d = await r.json();
      if (r.ok) { setState("sent"); setMessage(""); } else { setState("idle"); setError(d.error ?? "Não foi possível enviar."); }
    } catch { setState("idle"); setError("Sem conexão. Tente novamente."); }
  }
  if (state === "sent") return <p className="pv-sent">✓ Mensagem enviada. A clínica vai responder em breve.</p>;
  return (
    <form onSubmit={submit} className="pv-form pv-qform">
      {divider && <div className="pv-divider"><span>ou envie por aqui</span></div>}
      <label>Sua dúvida<textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} required minLength={3} maxLength={1000} placeholder="Ex.: Posso dividir a entrada em duas vezes?" /></label>
      <label>WhatsApp para retorno (opcional)<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(41) 99999-0000" /></label>
      {error && <p className="pv-error" role="alert">{error}</p>}
      <button className="pv-btn pv-btn-ghost-dark" disabled={state === "busy"}>{state === "busy" ? "Enviando…" : "Enviar dúvida"}</button>
    </form>
  );
}

function WaIcon() {
  return <svg className="pv-wa-icon" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>;
}
