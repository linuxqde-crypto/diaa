-- KROTO PostgreSQL bootstrap. Runs once on first container start.
-- Principle of least privilege: the application role gets DML but can never
-- UPDATE/DELETE the immutable audit trail or webhook logs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive emails if needed later
