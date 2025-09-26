import { NextRequest, NextResponse } from 'next/server';
import { analyzeCallUnified } from '@/lib/unified-analysis';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Configure runtime for longer execution
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum allowed on Vercel Pro

export async function POST(request: NextRequest) {
  try {
    // Create Supabase client with cookies for auth
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    // Optional: Check for admin role
    // const { data: profile } = await supabase
    //   .from('profiles')
    //   .select('role')
    //   .eq('id', user.id)
    //   .single();
    //
    // if (profile?.role !== 'admin') {
    //   return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    // }

    const { recording_url, meta } = await request.json();

    if (!recording_url) {
      return NextResponse.json({ error: 'Recording URL required' }, { status: 400 });
    }

    console.log('[Admin Test] Processing:', recording_url);
    console.log('[Admin Test] User:', user.email);

    // Use the unified analysis function
    const result = await analyzeCallUnified(recording_url, meta, {
      includeScores: false,  // Don't include legacy scores for testing
      skipRebuttals: false   // Include rebuttals
    });

    // Log success
    console.log('[Admin Test] Analysis complete:', {
      outcome: result.analysis?.outcome,
      objections: result.mentions_table?.objection_spans?.length || 0,
      rebuttals_addressed: result.rebuttals?.used?.length || 0,
      rebuttals_missed: result.rebuttals?.missed?.length || 0
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Admin Test] Error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    );
  }
}