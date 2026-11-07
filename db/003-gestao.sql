-- Apply in the dedicated Clínica em Dia database after 002-tracking.sql.
CREATE TABLE IF NOT EXISTS clinic_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  patient text NOT NULL,
  phone text NOT NULL,
  source text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('new', 'scheduled', 'evaluated', 'quoted', 'followup', 'won', 'lost')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 0 AND 100000000),
  appointment_at timestamptz,
  followup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinic_opportunities_owner ON clinic_opportunities(owner_id, created_at DESC);
