-- HOTFIX: Fix Production Errors
-- Created: 2025-01-16
-- Purpose: Fix critical production issues immediately

-- 1. DROP AND RECREATE the function with proper column references
DROP FUNCTION IF EXISTS get_next_transcription_job();

CREATE OR REPLACE FUNCTION get_next_transcription_job()
RETURNS TABLE (
  queue_id INTEGER,
  call_id UUID,
  recording_url TEXT,
  priority INTEGER,
  attempts INTEGER
) AS $$
BEGIN
  -- Update and return the next pending job
  -- Priority order: status='pending', highest priority, oldest first
  RETURN QUERY
  UPDATE transcription_queue tq
  SET
    status = 'processing',
    started_at = NOW(),
    attempts = tq.attempts + 1  -- FIX: Use table alias
  FROM (
    SELECT id
    FROM transcription_queue
    WHERE status = 'pending'
      AND attempts < 3 -- Max 3 attempts
    ORDER BY
      priority DESC,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED -- Prevent race conditions
  ) next_job
  WHERE tq.id = next_job.id
  RETURNING
    tq.id as queue_id,
    tq.call_id,
    tq.recording_url,
    tq.priority,
    tq.attempts;  -- FIX: Use table alias
END;
$$ LANGUAGE plpgsql;

-- 2. Create missing RPC functions for user management
CREATE OR REPLACE FUNCTION get_users_by_level_v2(target_level INT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  level INT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id,
    au.email::TEXT,
    up.first_name::TEXT,
    up.last_name::TEXT,
    up.level,
    au.created_at,
    au.last_sign_in_at
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.id = au.id
  WHERE up.level = target_level
  ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create agent user creation function
CREATE OR REPLACE FUNCTION create_agent_user(
  user_email TEXT,
  user_password TEXT,
  user_first_name TEXT DEFAULT NULL,
  user_last_name TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  new_user_id UUID;
  result JSON;
BEGIN
  -- Create user in auth.users (this is a simplified version)
  -- In production, you'd use Supabase Auth API

  -- For now, just create the user profile
  INSERT INTO user_profiles (id, email, first_name, last_name, level)
  VALUES (gen_random_uuid(), user_email, user_first_name, user_last_name, 1)
  RETURNING id INTO new_user_id;

  result := json_build_object(
    'success', true,
    'user_id', new_user_id,
    'email', user_email
  );

  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create is_admin function if missing
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_level INT;
BEGIN
  SELECT level INTO user_level
  FROM user_profiles
  WHERE id = auth.uid();

  RETURN COALESCE(user_level >= 3, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Ensure user_profiles table exists with proper structure
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  level INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Add missing columns to contacts table if they don't exist
DO $$
BEGIN
  -- Add primary_phone if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'primary_phone'
  ) THEN
    ALTER TABLE contacts ADD COLUMN primary_phone TEXT;
  END IF;
END $$;

-- 7. Create index for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_level ON user_profiles(level);
CREATE INDEX IF NOT EXISTS idx_contacts_primary_phone ON contacts(primary_phone);

-- 8. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;