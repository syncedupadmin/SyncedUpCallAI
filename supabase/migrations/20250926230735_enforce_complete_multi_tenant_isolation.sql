-- =====================================================
-- CRITICAL MULTI-TENANT ISOLATION ENFORCEMENT
-- =====================================================
-- This migration ensures ALL business tables have proper
-- agency isolation at the database level.
--
-- Run this in Supabase SQL Editor to enforce complete
-- multi-tenant security.
-- =====================================================

-- =====================================================
-- STEP 1: Add agency_id to all business tables
-- =====================================================

-- Transcripts table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='transcripts' AND column_name='agency_id'
    ) THEN
        -- Add column (nullable first)
        ALTER TABLE public.transcripts ADD COLUMN agency_id UUID;

        -- Populate from calls table
        UPDATE public.transcripts t
        SET agency_id = c.agency_id
        FROM public.calls c
        WHERE t.call_id = c.id;

        -- Make it NOT NULL
        ALTER TABLE public.transcripts ALTER COLUMN agency_id SET NOT NULL;

        -- Add foreign key
        ALTER TABLE public.transcripts
        ADD CONSTRAINT fk_transcripts_agency
        FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX idx_transcripts_agency_id ON public.transcripts(agency_id);

        RAISE NOTICE '✅ Added agency_id to transcripts table';
    ELSE
        RAISE NOTICE '✓ Transcripts table already has agency_id';
    END IF;
END $$;

-- Analyses table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='analyses' AND column_name='agency_id'
    ) THEN
        -- Add column (nullable first)
        ALTER TABLE public.analyses ADD COLUMN agency_id UUID;

        -- Populate from calls table
        UPDATE public.analyses a
        SET agency_id = c.agency_id
        FROM public.calls c
        WHERE a.call_id = c.id;

        -- Make it NOT NULL
        ALTER TABLE public.analyses ALTER COLUMN agency_id SET NOT NULL;

        -- Add foreign key
        ALTER TABLE public.analyses
        ADD CONSTRAINT fk_analyses_agency
        FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX idx_analyses_agency_id ON public.analyses(agency_id);

        RAISE NOTICE '✅ Added agency_id to analyses table';
    ELSE
        RAISE NOTICE '✓ Analyses table already has agency_id';
    END IF;
END $$;

-- Contacts table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='contacts' AND column_name='agency_id'
    ) THEN
        -- Add column (nullable first)
        ALTER TABLE public.contacts ADD COLUMN agency_id UUID;

        -- Populate from calls table (use first agency that references this contact)
        UPDATE public.contacts ct
        SET agency_id = (
            SELECT c.agency_id
            FROM public.calls c
            WHERE c.contact_id = ct.id
            ORDER BY c.created_at ASC
            LIMIT 1
        );

        -- For contacts with no calls, assign to default agency
        UPDATE public.contacts
        SET agency_id = (SELECT id FROM public.agencies ORDER BY created_at ASC LIMIT 1)
        WHERE agency_id IS NULL;

        -- Make it NOT NULL
        ALTER TABLE public.contacts ALTER COLUMN agency_id SET NOT NULL;

        -- Add foreign key
        ALTER TABLE public.contacts
        ADD CONSTRAINT fk_contacts_agency
        FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX idx_contacts_agency_id ON public.contacts(agency_id);

        RAISE NOTICE '✅ Added agency_id to contacts table';
    ELSE
        RAISE NOTICE '✓ Contacts table already has agency_id';
    END IF;
END $$;

-- Agents table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='agents' AND column_name='agency_id'
    ) THEN
        -- Add column (nullable first)
        ALTER TABLE public.agents ADD COLUMN agency_id UUID;

        -- Populate from calls table (use first agency that references this agent)
        UPDATE public.agents ag
        SET agency_id = (
            SELECT c.agency_id
            FROM public.calls c
            WHERE c.agent_id = ag.id
            ORDER BY c.created_at ASC
            LIMIT 1
        );

        -- For agents with no calls, assign to default agency
        UPDATE public.agents
        SET agency_id = (SELECT id FROM public.agencies ORDER BY created_at ASC LIMIT 1)
        WHERE agency_id IS NULL;

        -- Make it NOT NULL
        ALTER TABLE public.agents ALTER COLUMN agency_id SET NOT NULL;

        -- Add foreign key
        ALTER TABLE public.agents
        ADD CONSTRAINT fk_agents_agency
        FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX idx_agents_agency_id ON public.agents(agency_id);

        RAISE NOTICE '✅ Added agency_id to agents table';
    ELSE
        RAISE NOTICE '✓ Agents table already has agency_id';
    END IF;
END $$;

-- Call events table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='call_events' AND column_name='agency_id'
    ) THEN
        -- Add column (nullable first)
        ALTER TABLE public.call_events ADD COLUMN agency_id UUID;

        -- Populate from calls table
        UPDATE public.call_events ce
        SET agency_id = c.agency_id
        FROM public.calls c
        WHERE ce.call_id = c.id;

        -- Make it NOT NULL
        ALTER TABLE public.call_events ALTER COLUMN agency_id SET NOT NULL;

        -- Add foreign key
        ALTER TABLE public.call_events
        ADD CONSTRAINT fk_call_events_agency
        FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX idx_call_events_agency_id ON public.call_events(agency_id);

        RAISE NOTICE '✅ Added agency_id to call_events table';
    ELSE
        RAISE NOTICE '✓ Call_events table already has agency_id';
    END IF;
END $$;

-- Transcript embeddings table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='transcript_embeddings' AND column_name='agency_id'
    ) THEN
        -- Add column (nullable first)
        ALTER TABLE public.transcript_embeddings ADD COLUMN agency_id UUID;

        -- Populate from calls table
        UPDATE public.transcript_embeddings te
        SET agency_id = c.agency_id
        FROM public.calls c
        WHERE te.call_id = c.id;

        -- Make it NOT NULL
        ALTER TABLE public.transcript_embeddings ALTER COLUMN agency_id SET NOT NULL;

        -- Add foreign key
        ALTER TABLE public.transcript_embeddings
        ADD CONSTRAINT fk_transcript_embeddings_agency
        FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX idx_transcript_embeddings_agency_id ON public.transcript_embeddings(agency_id);

        RAISE NOTICE '✅ Added agency_id to transcript_embeddings table';
    ELSE
        RAISE NOTICE '✓ Transcript_embeddings table already has agency_id';
    END IF;
END $$;

-- =====================================================
-- STEP 2: Enable RLS on all business tables
-- =====================================================

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_embeddings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 3: Create/update RLS policies for all tables
-- =====================================================

-- Helper function to check agency access
CREATE OR REPLACE FUNCTION public.user_has_agency_access(check_agency_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- Super admins have access to all agencies
    IF public.is_super_admin() THEN
        RETURN TRUE;
    END IF;

    -- Check if user has access to this agency
    RETURN EXISTS (
        SELECT 1
        FROM public.user_agencies
        WHERE user_id = auth.uid()
        AND agency_id = check_agency_id
    );
END;
$$;

-- TRANSCRIPTS policies
DROP POLICY IF EXISTS "Users can view transcripts from their agencies" ON public.transcripts;
CREATE POLICY "Users can view transcripts from their agencies" ON public.transcripts
    FOR SELECT TO authenticated
    USING (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can insert transcripts for their agencies" ON public.transcripts;
CREATE POLICY "Users can insert transcripts for their agencies" ON public.transcripts
    FOR INSERT TO authenticated
    WITH CHECK (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can update transcripts from their agencies" ON public.transcripts;
CREATE POLICY "Users can update transcripts from their agencies" ON public.transcripts
    FOR UPDATE TO authenticated
    USING (user_has_agency_access(agency_id))
    WITH CHECK (user_has_agency_access(agency_id));

-- ANALYSES policies
DROP POLICY IF EXISTS "Users can view analyses from their agencies" ON public.analyses;
CREATE POLICY "Users can view analyses from their agencies" ON public.analyses
    FOR SELECT TO authenticated
    USING (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can insert analyses for their agencies" ON public.analyses;
CREATE POLICY "Users can insert analyses for their agencies" ON public.analyses
    FOR INSERT TO authenticated
    WITH CHECK (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can update analyses from their agencies" ON public.analyses;
CREATE POLICY "Users can update analyses from their agencies" ON public.analyses
    FOR UPDATE TO authenticated
    USING (user_has_agency_access(agency_id))
    WITH CHECK (user_has_agency_access(agency_id));

-- CONTACTS policies
DROP POLICY IF EXISTS "Users can view contacts from their agencies" ON public.contacts;
CREATE POLICY "Users can view contacts from their agencies" ON public.contacts
    FOR SELECT TO authenticated
    USING (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can insert contacts for their agencies" ON public.contacts;
CREATE POLICY "Users can insert contacts for their agencies" ON public.contacts
    FOR INSERT TO authenticated
    WITH CHECK (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can update contacts from their agencies" ON public.contacts;
CREATE POLICY "Users can update contacts from their agencies" ON public.contacts
    FOR UPDATE TO authenticated
    USING (user_has_agency_access(agency_id))
    WITH CHECK (user_has_agency_access(agency_id));

-- AGENTS policies
DROP POLICY IF EXISTS "Users can view agents from their agencies" ON public.agents;
CREATE POLICY "Users can view agents from their agencies" ON public.agents
    FOR SELECT TO authenticated
    USING (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can insert agents for their agencies" ON public.agents;
CREATE POLICY "Users can insert agents for their agencies" ON public.agents
    FOR INSERT TO authenticated
    WITH CHECK (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can update agents from their agencies" ON public.agents;
CREATE POLICY "Users can update agents from their agencies" ON public.agents
    FOR UPDATE TO authenticated
    USING (user_has_agency_access(agency_id))
    WITH CHECK (user_has_agency_access(agency_id));

-- CALL_EVENTS policies
DROP POLICY IF EXISTS "Users can view events from their agencies" ON public.call_events;
CREATE POLICY "Users can view events from their agencies" ON public.call_events
    FOR SELECT TO authenticated
    USING (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can insert events for their agencies" ON public.call_events;
CREATE POLICY "Users can insert events for their agencies" ON public.call_events
    FOR INSERT TO authenticated
    WITH CHECK (user_has_agency_access(agency_id));

-- TRANSCRIPT_EMBEDDINGS policies
DROP POLICY IF EXISTS "Users can view embeddings from their agencies" ON public.transcript_embeddings;
CREATE POLICY "Users can view embeddings from their agencies" ON public.transcript_embeddings
    FOR SELECT TO authenticated
    USING (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can insert embeddings for their agencies" ON public.transcript_embeddings;
CREATE POLICY "Users can insert embeddings for their agencies" ON public.transcript_embeddings
    FOR INSERT TO authenticated
    WITH CHECK (user_has_agency_access(agency_id));

DROP POLICY IF EXISTS "Users can update embeddings from their agencies" ON public.transcript_embeddings;
CREATE POLICY "Users can update embeddings from their agencies" ON public.transcript_embeddings
    FOR UPDATE TO authenticated
    USING (user_has_agency_access(agency_id))
    WITH CHECK (user_has_agency_access(agency_id));

-- =====================================================
-- STEP 4: Create security audit log
-- =====================================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    agency_id UUID REFERENCES public.agencies(id),
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for querying
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON public.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_agency_id ON public.security_audit_log(agency_id);

-- Enable RLS
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can view audit logs
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.security_audit_log;
CREATE POLICY "Super admins can view all audit logs" ON public.security_audit_log
    FOR SELECT TO authenticated
    USING (public.is_super_admin());

-- System can insert audit logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.security_audit_log;
CREATE POLICY "System can insert audit logs" ON public.security_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- =====================================================
-- STEP 5: Verification
-- =====================================================

DO $$
DECLARE
    tables_with_agency_id INTEGER;
    tables_with_rls INTEGER;
    tables_with_policies INTEGER;
BEGIN
    -- Count tables with agency_id
    SELECT COUNT(*) INTO tables_with_agency_id
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND column_name = 'agency_id'
    AND table_name IN ('calls', 'transcripts', 'analyses', 'contacts', 'agents', 'call_events', 'transcript_embeddings');

    -- Count tables with RLS enabled
    SELECT COUNT(*) INTO tables_with_rls
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE t.schemaname = 'public'
    AND t.tablename IN ('calls', 'transcripts', 'analyses', 'contacts', 'agents', 'call_events', 'transcript_embeddings')
    AND c.relrowsecurity = true;

    -- Count tables with policies
    SELECT COUNT(DISTINCT tablename) INTO tables_with_policies
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('calls', 'transcripts', 'analyses', 'contacts', 'agents', 'call_events', 'transcript_embeddings');

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MULTI-TENANT ISOLATION VERIFICATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Tables with agency_id: % / 7', tables_with_agency_id;
    RAISE NOTICE '✅ Tables with RLS enabled: % / 7', tables_with_rls;
    RAISE NOTICE '✅ Tables with RLS policies: % / 7', tables_with_policies;
    RAISE NOTICE '';

    IF tables_with_agency_id = 7 AND tables_with_rls = 7 AND tables_with_policies = 7 THEN
        RAISE NOTICE '🎉 SUCCESS: Complete multi-tenant isolation configured!';
    ELSE
        RAISE WARNING '⚠️  Some tables may be missing proper isolation';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Run the audit script (scripts/audit-supabase-schema.sql)';
    RAISE NOTICE 'to verify complete configuration.';
    RAISE NOTICE '';
END $$;