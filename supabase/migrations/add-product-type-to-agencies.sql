-- Add product type to agencies for compliance-only vs full platform
-- This enables different feature sets per customer

-- Add product_type column
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS product_type VARCHAR(50) DEFAULT 'full';

-- Comment explaining the column
COMMENT ON COLUMN agencies.product_type IS
'Product tier: "full" (all features) or "compliance_only" (post-close compliance only)';

-- Update existing agencies to full product
UPDATE agencies SET product_type = 'full' WHERE product_type IS NULL;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_agencies_product_type ON agencies(product_type);
