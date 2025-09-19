import { NextRequest, NextResponse } from 'next/server';

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 second timeout for parallel fetching

// Get list of agents active in a date range using agent-productivity/search
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const campaignId = searchParams.get('campaignId'); // Optional campaign filter

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo are required' },
        { status: 400 }
      );
    }

    console.log(`[Get Agents] Fetching agents from ${dateFrom} to ${dateTo}`);

    // Build query parameters for agent-productivity/search
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN!,
      date_start: dateFrom, // Format: YYYY-MM-DD
      date_end: dateTo,
      limit: '1000', // Max allowed by API
      offset: '0'
    });

    // Add campaign filter if provided
    if (campaignId) {
      params.append('campaign_id', campaignId);
    }

    const agentsMap = new Map<string, {
      user_id: string;
      name: string;
      email?: string;
      campaigns: Set<string>;
      lastActivity: string;
      totalEvents: number;
    }>();

    let hasMore = true;
    let offset = 0;
    let totalFound = 0;

    // Paginate through all results
    while (hasMore) {
      params.set('offset', String(offset));

      const url = `${CONVOSO_API_BASE}/agent-productivity/search?${params.toString()}`;
      console.log(`[Get Agents] Fetching page at offset ${offset}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success === false) {
        throw new Error(data.text || data.error || 'API returned failure');
      }

      if (data.data && data.data.entries) {
        totalFound = parseInt(data.data.total) || 0;
        const entries = data.data.entries;

        // Process each productivity entry
        entries.forEach((entry: any) => {
          const userId = entry.user_id;
          const userName = entry.user_name || 'Unknown Agent';

          if (userId && userName !== 'Unknown Agent') {
            const existing = agentsMap.get(userId);

            if (existing) {
              // Update existing agent info
              existing.totalEvents++;
              if (entry.campaign_name) {
                existing.campaigns.add(entry.campaign_name);
              }
              // Update last activity if this is more recent
              if (entry.created_at > existing.lastActivity) {
                existing.lastActivity = entry.created_at;
              }
            } else {
              // Add new agent
              agentsMap.set(userId, {
                user_id: userId,
                name: userName,
                email: entry.agent_email,
                campaigns: new Set(entry.campaign_name ? [entry.campaign_name] : []),
                lastActivity: entry.created_at,
                totalEvents: 1
              });
            }
          }
        });

        // Check if there are more pages
        if (entries.length < 1000 || offset + entries.length >= totalFound) {
          hasMore = false;
        } else {
          offset += 1000;
        }
      } else {
        hasMore = false;
      }
    }

    // Now also fetch from log/retrieve to get agents who made calls
    // Fetch multiple pages in parallel to catch ALL agents
    console.log('[Get Agents] Fetching calls to find all agents...');

    // First, get total count of calls
    const countParams = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN!,
      start_time: `${dateFrom} 00:00:00`,
      end_time: `${dateTo} 23:59:59`,
      limit: '1',
      offset: '0'
    });

    try {
      const countUrl = `${CONVOSO_API_BASE}/log/retrieve?${countParams.toString()}`;
      const countResponse = await fetch(countUrl);

      if (countResponse.ok) {
        const countData = await countResponse.json();
        const totalCalls = countData.data?.total_found || 0;
        console.log(`[Get Agents] Total calls in date range: ${totalCalls}`);

        // Determine how many pages to fetch (10k calls per page, up to 10 pages = 100k calls)
        const callsPerPage = 10000;
        const maxPages = Math.min(Math.ceil(totalCalls / callsPerPage), 10); // Cap at 10 pages (100k calls)

        console.log(`[Get Agents] Fetching ${maxPages} pages of calls in parallel to find all agents`);

        // Create parallel fetch promises
        const fetchPromises = [];
        for (let page = 0; page < maxPages; page++) {
          const pageOffset = page * callsPerPage;

          const pageParams = new URLSearchParams({
            auth_token: CONVOSO_AUTH_TOKEN!,
            start_time: `${dateFrom} 00:00:00`,
            end_time: `${dateTo} 23:59:59`,
            limit: String(callsPerPage),
            offset: String(pageOffset)
          });

          const fetchPage = fetch(`${CONVOSO_API_BASE}/log/retrieve?${pageParams.toString()}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.data?.results) {
                console.log(`[Get Agents] Page ${page + 1}: Processing ${data.data.results.length} calls`);
                return data.data.results;
              }
              return [];
            })
            .catch(err => {
              console.warn(`[Get Agents] Failed to fetch page ${page + 1}:`, err);
              return [];
            });

          fetchPromises.push(fetchPage);
        }

        // Wait for all pages to complete
        const allPageResults = await Promise.all(fetchPromises);

        // Process all calls to extract unique agents
        let totalCallsProcessed = 0;
        allPageResults.forEach(calls => {
          calls.forEach((call: any) => {
            totalCallsProcessed++;
            const userId = call.user_id;
            const userName = call.user || call.user_name;

            if (userId && userName && userName !== 'System User') {
              if (!agentsMap.has(userId)) {
                agentsMap.set(userId, {
                  user_id: userId,
                  name: userName,
                  campaigns: new Set([call.campaign || 'Unknown']),
                  lastActivity: call.call_date,
                  totalEvents: 1
                });
              } else {
                // Update existing agent's campaign list if they were found in productivity data
                const existing = agentsMap.get(userId)!;
                if (call.campaign) {
                  existing.campaigns.add(call.campaign);
                }
              }
            }
          });
        });

        console.log(`[Get Agents] Processed ${totalCallsProcessed} calls to find agents`);
      }
    } catch (error) {
      console.warn('[Get Agents] Could not fetch additional agents from log/retrieve:', error);
    }

    // Convert map to array and format
    const agents = Array.from(agentsMap.values())
      .map(agent => ({
        user_id: agent.user_id,
        name: agent.name,
        email: agent.email,
        campaigns: Array.from(agent.campaigns),
        lastActivity: agent.lastActivity,
        totalEvents: agent.totalEvents
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

    console.log(`[Get Agents] Found ${agents.length} unique agents`);

    return NextResponse.json({
      success: true,
      agents,
      total: agents.length,
      dateRange: { from: dateFrom, to: dateTo },
      campaignId
    });

  } catch (error: any) {
    console.error('[Get Agents] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}