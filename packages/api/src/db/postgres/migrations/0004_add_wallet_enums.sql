-- Create wallet status enum
CREATE TYPE wallet_status_enum AS ENUM (
  'active',
  'expired',
  'suspended'
);

-- Create wallet category enum (3 fixed categories per CLAUDE.md)
CREATE TYPE wallet_category_enum AS ENUM (
  'consultation',
  'medicine',
  'lab_test'
);

-- Create wallet transaction type enum
CREATE TYPE wallet_transaction_type_enum AS ENUM (
  'debit',           -- spend from wallet
  'credit',          -- top-up (Razorpay verified)
  'refund',          -- cancellation refund
  'expiry_snapshot', -- year-end snapshot (no balance change)
  'adjustment'       -- admin correction (audit required)
);