# Database Migration Instructions

Since automated migration isn't working with your current setup, please apply these migrations manually via the Supabase Dashboard.

## How to Apply Migrations

1. Go to [Supabase Dashboard](https://app.supabase.io)
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the SQL from each migration file below
6. Click **Run** (or press Ctrl+Enter)

## Migration 1: Add Strict Mode ✅ REQUIRED

**File**: `supabase/migrations/add-strict-mode-to-post-close.sql`

This adds the `strict_mode` boolean column to the `post_close_scripts` table.

```sql
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
```

## Migration 2: Add Agency Multi-Tenancy ⚠️ OPTIONAL (Read Notes)

**File**: `supabase/migrations/add-agency-to-post-close.sql`

**⚠️ IMPORTANT**: This migration requires an `agencies` table to exist. If you don't have multi-agency support set up yet, **skip this migration for now**.

### Check if you need this migration:

Run this query first:
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'agencies'
);
```

- If it returns `true`, you can proceed with this migration
- If it returns `false`, skip this migration (you'll need to set up the `agencies` table first)

<details>
<summary>Click to see the full SQL (only if agencies table exists)</summary>

```sql
-- Add Agency Multi-Tenancy to Post-Close Compliance System
-- Each agency should have their own scripts, compliance results, and performance tracking

-- Add agency_id to post_close_scripts
ALTER TABLE post_close_scripts
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to post_close_segments
ALTER TABLE post_close_segments
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to post_close_compliance
ALTER TABLE post_close_compliance
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to agent_post_close_performance
ALTER TABLE agent_post_close_performance
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to post_close_audit_log
ALTER TABLE post_close_audit_log
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Update indexes to include agency_id for better performance
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_agency ON post_close_scripts(agency_id);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_agency ON post_close_segments(agency_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_agency ON post_close_compliance(agency_id);
CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_agency ON agent_post_close_performance(agency_id);
CREATE INDEX IF NOT EXISTS idx_post_close_audit_agency ON post_close_audit_log(agency_id);

-- Update unique constraint to be per-agency (drop old one, add new one)
DROP INDEX IF EXISTS unique_active_script_idx;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_script_per_agency_idx
  ON post_close_scripts (agency_id, product_type, state)
  WHERE active = true;

-- Update performance tracking constraint to be per-agency
ALTER TABLE agent_post_close_performance
DROP CONSTRAINT IF EXISTS unique_agent_period;

ALTER TABLE agent_post_close_performance
ADD CONSTRAINT unique_agent_period_per_agency
UNIQUE (agency_id, agent_name, period_start, period_end);

-- Add RLS policies
ALTER TABLE post_close_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_post_close_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see scripts from their agencies
CREATE POLICY post_close_scripts_agency_isolation ON post_close_scripts
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see segments from their agencies
CREATE POLICY post_close_segments_agency_isolation ON post_close_segments
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see compliance results from their agencies
CREATE POLICY post_close_compliance_agency_isolation ON post_close_compliance
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see performance data from their agencies
CREATE POLICY agent_post_close_perf_agency_isolation ON agent_post_close_performance
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see audit logs from their agencies
CREATE POLICY post_close_audit_agency_isolation ON post_close_audit_log
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Add helpful comments
COMMENT ON COLUMN post_close_scripts.agency_id IS 'Agency that owns this script - scripts are isolated per agency';
COMMENT ON COLUMN post_close_segments.agency_id IS 'Agency that owns the call this segment came from';
COMMENT ON COLUMN post_close_compliance.agency_id IS 'Agency that owns this compliance result';
COMMENT ON COLUMN agent_post_close_performance.agency_id IS 'Agency this performance data belongs to';
COMMENT ON COLUMN post_close_audit_log.agency_id IS 'Agency this audit log entry belongs to';
```

</details>

## Verification

After running Migration 1, verify it worked:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'post_close_scripts'
AND column_name = 'strict_mode';
```

You should see:
- `column_name`: `strict_mode`
- `data_type`: `boolean`
- `column_default`: `false`

## Troubleshooting

### Error: "relation 'post_close_scripts' does not exist"

The post-close system tables haven't been created yet. You'll need to run the base schema migration first.

### Error: "relation 'agencies' does not exist"

Skip Migration 2 for now - it requires multi-agency support to be set up first.

### Error: "column already exists"

The migration has already been applied. You can safely ignore this and move to the next migration.

---

**Need Help?** Contact your database admin or check the [Supabase Documentation](https://supabase.com/docs/guides/database/migrations).
