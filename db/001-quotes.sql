-- Apply after Better Auth migration, in the dedicated Neon database only.
CREATE TABLE IF NOT EXISTS quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_owner_date ON quotes(owner_id,created_at DESC);
