-- Create wallet_categories table (3 fixed categories per wallet)
CREATE TABLE wallet_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category wallet_category_enum NOT NULL,
  annual_limit INTEGER NOT NULL,  -- from policy at wallet creation (snapshot)
  spent_amount INTEGER NOT NULL DEFAULT 0,  -- derived cache from transactions
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (wallet_id, category)
);

-- Indexes for wallet_categories
CREATE INDEX wallet_categories_wallet_idx ON wallet_categories(wallet_id);
CREATE INDEX wallet_categories_category_idx ON wallet_categories(category);

-- Create wallet_transactions table (append-only ledger - SOURCE OF TRUTH)
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  category wallet_category_enum NOT NULL,
  type wallet_transaction_type_enum NOT NULL,
  amount INTEGER NOT NULL,  -- positive for credit/refund, negative for debit
  balance_after INTEGER NOT NULL,  -- snapshot of category balance after this txn

  -- Source reference (polymorphic)
  source_type VARCHAR(50) NOT NULL,  -- 'consultation', 'prescription', 'lab_test', 'topup', 'cancellation', 'snapshot', 'admin'
  source_id UUID,  -- consultation_id, prescription_id, lab_order_id, topup_id, etc.

  -- Snapshot of policy/category limits at transaction time
  category_limit_at_txn INTEGER NOT NULL,

  -- Metadata
  description VARCHAR(500),
  created_by VARCHAR(100),  -- employee_id, doctor_id, admin_id, 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency for webhooks
  idempotency_key VARCHAR(100) UNIQUE
);

-- Indexes for wallet_transactions
CREATE INDEX wallet_txns_wallet_idx ON wallet_transactions(wallet_id);
CREATE INDEX wallet_txns_category_idx ON wallet_transactions(category);
CREATE INDEX wallet_txns_source_idx ON wallet_transactions(source_type, source_id);
CREATE INDEX wallet_txns_created_idx ON wallet_transactions(created_at);
CREATE INDEX wallet_txns_type_idx ON wallet_transactions(type);
CREATE INDEX wallet_txns_idempotency_idx ON wallet_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;