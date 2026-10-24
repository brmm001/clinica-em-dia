-- Online proposals, view tracking and WhatsApp delivery log.
-- Apply after db/001-quotes.sql, in the dedicated Neon database only. Idempotent.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_name text,
  ADD COLUMN IF NOT EXISTS accepted_ip text,
  ADD COLUMN IF NOT EXISTS accepted_user_agent text,
  -- Exact payload the patient saw when approving (proof of what was accepted).
  ADD COLUMN IF NOT EXISTS accepted_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS auto_reminders boolean NOT NULL DEFAULT true;

-- Backfill quotes created before this migration.
UPDATE quotes SET token = replace(gen_random_uuid()::text, '-', '') WHERE token IS NULL;
UPDATE quotes SET expires_at = ((payload->>'validity') || 'T23:59:59-03:00')::timestamptz
  WHERE expires_at IS NULL AND payload->>'validity' ~ '^\d{4}-\d{2}-\d{2}$';
ALTER TABLE quotes ALTER COLUMN token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_token ON quotes(token);

-- One row per patient visit (a reload within 30 minutes resumes the same visit).
CREATE TABLE IF NOT EXISTS quote_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  active_ms integer NOT NULL DEFAULT 0,
  max_scroll smallint NOT NULL DEFAULT 0,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  device text,
  referrer text
);
CREATE INDEX IF NOT EXISTS quote_views_quote ON quote_views(quote_id, started_at DESC);

-- Timeline: sent, opened, question, contact_click, accepted, wa_read, reminder...
CREATE TABLE IF NOT EXISTS quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  view_id uuid REFERENCES quote_views(id) ON DELETE SET NULL,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_events_quote ON quote_events(quote_id, created_at DESC);

-- Messages sent through the official WhatsApp Cloud API; status updated by webhook.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind text NOT NULL,
  to_phone text NOT NULL,
  wa_message_id text UNIQUE,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_quote ON whatsapp_messages(quote_id, created_at DESC);
