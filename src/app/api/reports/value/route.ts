import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = searchParams.get('to') || new Date().toISOString();
  const agent_id = searchParams.get('agent_id');
  const campaign = searchParams.get('campaign');

  // Build filter conditions
  const conditions = ['c.started_at >= $1', 'c.started_at <= $2'];
  const params: any[] = [from, to];
  
  if (agent_id) {
    conditions.push(`c.agent_id = $${params.length + 1}`);
    params.push(agent_id);
  }
  
  if (campaign) {
    conditions.push(`c.campaign = $${params.length + 1}`);
    params.push(campaign);
  }
  
  const whereClause = conditions.join(' AND ');

  // Get overall stats
  const stats = await db.one(`
    select 
      count(distinct c.id) as total_calls,
      count(distinct case when a.reason_primary in ('requested_cancel', 'already_covered', 'benefits_confusion') then c.id end) as total_cancels,
      coalesce(sum(case when a.reason_primary in ('requested_cancel', 'already_covered', 'benefits_confusion') and p.status in ('cancelled','refunded','chargeback') then p.premium else 0 end), 0) as weighted_cancel_value
    from calls c
    left join analyses a on a.call_id = c.id
    left join policies_stub p on p.contact_id = c.contact_id
    where ${whereClause}
  `, params);

  const cancel_rate = stats.total_calls > 0 
    ? ((stats.total_cancels / stats.total_calls) * 100).toFixed(2) 
    : '0.00';

  // Top agents by weighted cancel value
  const topAgents = await db.query(`
    select 
      ag.id,
      ag.name,
      count(distinct c.id) as calls,
      count(distinct case when a.reason_primary in ('requested_cancel', 'already_covered', 'benefits_confusion') then c.id end) as cancels,
      coalesce(sum(case when a.reason_primary in ('requested_cancel', 'already_covered', 'benefits_confusion') and p.status in ('cancelled','refunded','chargeback') then p.premium else 0 end), 0) as cancel_value
    from calls c
    join agents ag on ag.id = c.agent_id
    left join analyses a on a.call_id = c.id
    left join policies_stub p on p.contact_id = c.contact_id
    where ${whereClause}
    group by ag.id, ag.name
    order by cancel_value desc
    limit 10
  `, params);

  // Top campaigns by weighted cancel value
  const topCampaigns = await db.query(`
    select 
      c.campaign,
      count(distinct c.id) as calls,
      count(distinct case when a.reason_primary in ('requested_cancel', 'already_covered', 'benefits_confusion') then c.id end) as cancels,
      coalesce(sum(case when a.reason_primary in ('requested_cancel', 'already_covered', 'benefits_confusion') and p.status in ('cancelled','refunded','chargeback') then p.premium else 0 end), 0) as cancel_value
    from calls c
    left join analyses a on a.call_id = c.id
    left join policies_stub p on p.contact_id = c.contact_id
    where ${whereClause} and c.campaign is not null
    group by c.campaign
    order by cancel_value desc
    limit 10
  `, params);

  return NextResponse.json({
    stats: {
      ...stats,
      cancel_rate
    },
    topAgents: topAgents.rows,
    topCampaigns: topCampaigns.rows
  });
}
