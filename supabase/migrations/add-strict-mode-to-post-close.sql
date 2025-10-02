-- Add Strict Mode to Post-Close Compliance System
-- Enables 100% word-for-word script matching

-- Add strict_mode column
ALTER TABLE post_close_scripts
ADD COLUMN IF NOT EXISTS strict_mode BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN post_close_scripts.strict_mode IS
'When true, requires 100% exact word-for-word matching with no paraphrasing allowed. When false, allows fuzzy matching with 80% threshold.';

-- Update existing scripts to use normal mode (not strict) by default
UPDATE post_close_scripts
SET strict_mode = false
WHERE strict_mode IS NULL;
