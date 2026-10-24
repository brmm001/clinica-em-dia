"use client";
import { useEffect, useRef, useState } from "react";
import { SECTION_IDS, type SectionId } from "@/lib/engagement";

const BEAT_EVERY_MS = 10_000;
const IDLE_AFTER_MS = 60_000;

function visitorId() {
  const fresh = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");
  try {
    let v = localStorage.getItem("ced_visitor");
    if (!v) { v = fresh(); localStorage.setItem("ced_visitor", v); }
    return v;
  } catch { return fresh(); }
}

/** Section whose area crosses the reading line (45% of the viewport height). */
function currentSection(): SectionId | null {
  const line = window.innerHeight * 0.45;
  let best: SectionId | null = null, bestVisible = 0;
  for (const el of document.querySelectorAll<HTMLElement>("[data-track]")) {
    const id = el.dataset.track as SectionId;
    if (!SECTION_IDS.includes(id)) continue;
    const r = el.getBoundingClientRect();
    if (r.top <= line && r.bottom >= line) return id;
    const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (visible > bestVisible) { bestVisible = visible; best = id; }
  }
  return best;
}

/**
 * Measures real attention: time only counts while the tab is visible and the patient interacted
 * in the last minute. Totals are cumulative per visit and sent every 10 s (+ beacon on exit).
 */
export function useProposalTracking(token: string) {
  const view = useRef<string | null>(null);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let stopped = false, active = 0, scroll = 0, ticks = 0;
    const sections: Record<string, number> = {};
    let lastInput = Date.now(), lastTick = Date.now();

    const body = () => JSON.stringify({
      t: "beat", token, view: view.current, active: Math.round(active), scroll: Math.round(scroll),
      sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, Math.round(v)])),
    });
    const beat = (exit = false) => {
      if (!view.current) return;
      if (exit && navigator.sendBeacon) { navigator.sendBeacon("/api/track", new Blob([body()], { type: "text/plain" })); return; }
      fetch("/api/track", { method: "POST", body: body(), keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    };
    const measure = () => {
      const h = document.documentElement.scrollHeight;
      scroll = Math.max(scroll, Math.min(100, ((window.scrollY + window.innerHeight) / Math.max(h, 1)) * 100));
    };
    const input = () => { lastInput = Date.now(); };
    const onScroll = () => { input(); measure(); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") beat(true);
      else { lastInput = lastTick = Date.now(); }
    };
    const onHide = () => beat(true);

    const tick = setInterval(() => {
      const now = Date.now(), dt = Math.min(now - lastTick, 2_000);
      lastTick = now;
      if (!view.current || document.visibilityState !== "visible" || now - lastInput > IDLE_AFTER_MS) return;
      active += dt;
      const s = currentSection();
      if (s) sections[s] = (sections[s] ?? 0) + dt;
      if (++ticks % (BEAT_EVERY_MS / 1000) === 0) beat();
    }, 1_000);

    // Small delay avoids double visits from React StrictMode double-mount in development.
    const start = setTimeout(async () => {
      try {
        const r = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: "start", token, visitor: visitorId(), referrer: document.referrer || undefined }) });
        const d = r.ok ? await r.json() : null;
        if (!d || stopped) return;
        if (d.owner) { setOwner(true); return; }
        view.current = d.view;
        active = Number(d.active) || 0;
        scroll = Math.max(scroll, Number(d.scroll) || 0);
        Object.assign(sections, d.sections ?? {});
        measure();
        beat();
      } catch { /* tracking must never break the page */ }
    }, 250);

    window.addEventListener("scroll", onScroll, { passive: true });
    for (const ev of ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"]) window.addEventListener(ev, input, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      stopped = true;
      clearTimeout(start);
      clearInterval(tick);
      beat(true);
      window.removeEventListener("scroll", onScroll);
      for (const ev of ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"]) window.removeEventListener(ev, input);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [token]);

  const contact = () => {
    fetch("/api/track", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: "contact", token, view: view.current }) }).catch(() => {});
  };
  return { view, owner, contact };
}
