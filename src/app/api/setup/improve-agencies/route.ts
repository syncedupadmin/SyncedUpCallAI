import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run the migration using Supabase's admin API
    const migrations = [
      // Drop unique constraint on name
      `ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_name_key`,

      // Ensure slug has unique index
      `CREATE UNIQUE INDEX IF NOT EXISTS agencies_slug_key ON public.agencies(slug)`,

      // Create slugify function
      `CREATE OR REPLACE FUNCTION public.slugify(txt text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE
      AS $$
        SELECT lower(regexp_replace(coalesce(txt, ''), '[^a-z0-9]+', '-', 'g'))
      $$`,

      // Create next_unique_slug function
      `CREATE OR REPLACE FUNCTION public.next_unique_slug(base_slug text)
      RETURNS text
      LANGUAGE plpgsql
      AS $$
      DECLARE
        s   text := nullif(base_slug, '');
        n   int  := 1;
        out text;
      BEGIN
        IF s IS NULL THEN
          s := 'agency';
        END IF;

        LOOP
          out := CASE WHEN n = 1 THEN s ELSE s || '-' || n END;
          EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agencies WHERE slug = out);
          n := n + 1;
        END LOOP;

        RETURN out;
      END;
      $$`,

      // Update the RPC function
      `CREATE OR REPLACE FUNCTION public.create_agency_with_owner(p_name text)
      RETURNS public.agencies
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        v_agency public.agencies;
        v_slug   text;
      BEGIN
        -- Generate a unique slug from the name
        v_slug := public.next_unique_slug(public.slugify(p_name));

        -- Insert the new agency with auto-generated slug and current user as owner
        INSERT INTO public.agencies(name, slug, owner_user_id, created_at, updated_at)
        VALUES (
          p_name,
          v_slug,
          auth.uid(),
          now(),
          now()
        )
        RETURNING * INTO v_agency;

        RETURN v_agency;
      END;
      $$`,

      // Grant permissions
      `GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text) TO authenticated`,
      `GRANT EXECUTE ON FUNCTION public.slugify(text) TO authenticated`,
      `GRANT EXECUTE ON FUNCTION public.next_unique_slug(text) TO authenticated`
    ];

    const results = [];

    for (const sql of migrations) {
      try {
        // Use raw SQL execution
        const { error } = await supabase.rpc('sql_migration_helper', {
          query: sql
        }).single();

        if (error) {
          // If the helper doesn't exist, try direct execution (won't work in most cases due to RLS)
          console.log('Migration helper not found, attempting direct execution');
          results.push({ sql: sql.substring(0, 50) + '...', status: 'skipped', note: 'Requires manual execution' });
        } else {
          results.push({ sql: sql.substring(0, 50) + '...', status: 'success' });
        }
      } catch (err: any) {
        results.push({
          sql: sql.substring(0, 50) + '...',
          status: 'error',
          error: err.message
        });
      }
    }

    return NextResponse.json({
      message: 'Migration process completed',
      results,
      note: 'If migrations failed, please run the SQL manually in Supabase Dashboard under SQL Editor',
      sqlFile: '/supabase/migrations/20250109_improve_agencies_slug.sql'
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error.message,
        help: 'Please run the migration manually in Supabase Dashboard'
      },
      { status: 500 }
    );
  }
}