-- Restores the missing developer application state column using the existing
-- enum contract. Existing application IDs are preserved.
ALTER TABLE "afuchat"."developer_applications"
  ADD COLUMN IF NOT EXISTS "status" "afuchat"."developer_status"
  NOT NULL DEFAULT 'pending'::"afuchat"."developer_status";
