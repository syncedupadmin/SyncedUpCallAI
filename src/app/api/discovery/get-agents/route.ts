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

    const startTime = startDate.toISOString().split('T')[0] + ' 00:00:00';
    const endTime = endDate.toISOString().split('T')[0] + ' 23:59:59';

    console.log(`[Get Agents] Fetching calls from ${startTime} to ${endTime}`);

    // Fetch calls from Convoso using log/retrieve
    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      start_time: startTime,
      end_time: endTime,
      limit: '10000' // Fetch enough to find all agents
    });

    const response = await fetch(`${apiBase}/log/retrieve?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Get Agents] Convoso API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch calls from Convoso' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const calls = data.data?.results || [];

    console.log(`[Get Agents] Retrieved ${calls.length} calls from Convoso`);

    // Extract unique agents from calls (only 10+ second calls)
    const agentsMap = new Map<string, {
      user_id: string;
      name: string;
      email?: string;
      callCount: number;
      totalDuration: number;
    }>();

    calls.forEach((call: any) => {
      const duration = call.duration_sec || call.duration || 0;

      // CRITICAL: Only count calls 10 seconds or longer
      if (duration >= 10) {
        const userId = call.user_id;
        const userName = call.user || call.user_name;
        const userEmail = call.user_email || call.agent_email;

        if (userId && userName && userName !== 'System User') {
          const existing = agentsMap.get(userId);

          if (existing) {
            existing.callCount++;
            existing.totalDuration += duration;
          } else {
            agentsMap.set(userId, {
              user_id: userId,
              name: userName,
              email: userEmail,
              callCount: 1,
              totalDuration: duration
            });
          }
        }
      }
    });

    // Convert to array and format
    const agents = Array.from(agentsMap.values())
      .map(agent => ({
        user_id: agent.user_id,
        name: agent.name,
        email: agent.email,
        callCount: agent.callCount,
        avgDuration: Math.round(agent.totalDuration / agent.callCount)
      }))
      .filter(agent => agent.callCount >= 5) // Only show agents with at least 5 calls
      .sort((a, b) => b.callCount - a.callCount); // Sort by call count descending

    console.log(`[Get Agents] Found ${agents.length} agents with 10+ second calls`);

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
