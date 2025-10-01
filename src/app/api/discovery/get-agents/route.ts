import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { decryptConvosoCredentials } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's agency with encrypted credentials
    const { data: membership } = await supabase
      .from('user_agencies')
      .select('agency_id, agencies!inner(id, convoso_credentials)')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    const agency = (membership as any).agencies;

    if (!agency.convoso_credentials) {
      return NextResponse.json({ error: 'Convoso credentials not configured' }, { status: 400 });
    }

    // Decrypt credentials
    const credentials = decryptConvosoCredentials(agency.convoso_credentials);
    const apiBase = 'https://api.convoso.com/v1';

    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const dateStart = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const dateEnd = endDate.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[Get Agents] Fetching agent performance from ${dateStart} to ${dateEnd}`);

    // Use agent-performance/search to get all agents with call metrics
    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      date_start: dateStart,
      date_end: dateEnd
    });

    const response = await fetch(`${apiBase}/agent-performance/search?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Get Agents] Convoso API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch agents from Convoso' },
        { status: 500 }
      );
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      console.error('[Get Agents] Invalid API response:', result);
      return NextResponse.json(
        { error: 'Invalid response from Convoso API' },
        { status: 500 }
      );
    }

    console.log(`[Get Agents] Retrieved ${result.total} agents from Convoso`);

    // Convert agent performance data to agent list
    const agentData = Object.values(result.data) as any[];

    const agents = agentData
      .filter(agent => {
        // Filter out system users and agents with too few calls
        return agent.human_answered >= 5 &&
               agent.name !== 'System User' &&
               agent.user_id;
      })
      .map(agent => ({
        user_id: agent.user_id,
        name: agent.name,
        email: null, // Not provided by agent-performance endpoint
        callCount: agent.human_answered, // Use human_answered as call count
        avgDuration: 0 // Not needed for agent selection
      }))
      .sort((a, b) => b.callCount - a.callCount); // Sort by call count descending

    console.log(`[Get Agents] Found ${agents.length} agents with 5+ human-answered calls`);

    return NextResponse.json({
      success: true,
      agents,
      total: agents.length,
      dateRange: { from: startDate.toISOString(), to: endDate.toISOString() }
    });

  } catch (error: any) {
    console.error('[Get Agents] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
