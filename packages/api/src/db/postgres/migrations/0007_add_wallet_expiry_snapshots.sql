-- Create wallet_expiry_snapshots table (preserve unclaimed benefits at policy year end)
CREATE TABLE wallet_expiry_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  category wallet_category_enum NOT NULL,
  annual_limit INTEGER NOT NULL,
  spent_amount INTEGER NOT NULL,
  unclaimed_amount INTEGER NOT NULL,  -- annual_limit - spent_amount
  policy_year_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (wallet_id, category, policy_year_end)
);

-- Indexes for wallet_expiry_snapshots
CREATE INDEX expiry_snapshots_employee_idx ON wallet_expiry_snapshots(employee_id);
CREATE INDEX expiry_snapshots_policy_year_idx ON wallet_expiry_snapshots(policy_year_end);
CREATE INDEX expiry_snapshots_wallet_idx ON wallet_expiry_snapshots(wallet_id);