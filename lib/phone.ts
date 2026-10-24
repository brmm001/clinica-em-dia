/** Normalizes a phone to WhatsApp format (digits with country code). Brazilian numbers without DDI get 55. */
export function normalizePhone(raw: string | undefined | null): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.startsWith('55')) return d.length === 12 || d.length === 13 ? d : null;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Human formatting, e.g. +55 (41) 99999-0000. */
export function formatPhone(raw: string | undefined | null): string {
  const d = normalizePhone(raw);
  if (!d) return String(raw ?? '');
  if (d.startsWith('55')) {
    const local = d.slice(4);
    return `+55 (${d.slice(2, 4)}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
  }
  return '+' + d;
}

/** Click-to-chat link (opens WhatsApp with a pre-filled message from the user's own phone). */
export function waLink(phone: string | undefined | null, text: string): string {
  const d = normalizePhone(phone);
  return `https://wa.me/${d ?? ''}?text=${encodeURIComponent(text)}`;
}
