-- Create wallets table (one per employee per policy year)
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id),
  policy_year_start DATE NOT NULL,
  policy_year_end DATE NOT NULL,
  status wallet_status_enum NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employee_id, policy_year_start)
);

-- Indexes
CREATE INDEX wallets_employee_idx ON wallets(employee_id);
CREATE INDEX wallets_policy_year_idx ON wallets(policy_year_start, policy_year_end);
CREATE INDEX wallets_status_idx ON wallets(status);
CREATE INDEX wallets_policy_id_idx ON wallets(policy_id);