import { neon } from "@neondatabase/serverless";
import { getAuth, ready } from "./auth";

export const dbReady = () => Boolean(process.env.DATABASE_URL);
export const db = () => neon(process.env.DATABASE_URL!);

/** Logged-in user for API routes, or null. */
export async function currentUser(req: Request) {
  if (!ready()) return null;
  return (await getAuth().api.getSession({ headers: req.headers }))?.user ?? null;
}

/** Same-origin check for state-changing requests coming from the app. */
export function sameOrigin(req: Request) {
  return req.headers.get("origin") === new URL(process.env.BETTER_AUTH_URL || req.url).origin;
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "https://clinica-em-dia-iota.vercel.app").replace(/\/$/, "");
}
export const proposalUrl = (token: string) => `${siteOrigin()}/p/${token}`;

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
}

/** Reads a JSON body (also accepts text/plain, used by navigator.sendBeacon) with a size cap. */
export async function readJson(req: Request, max = 20_000): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > max) throw new Error("too_large");
  return JSON.parse(raw);
}
