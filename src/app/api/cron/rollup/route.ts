import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Get target date (yesterday by default, or specific date from query)
    const dateParam = req.nextUrl.searchParams.get('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setDate(targetDate.getDate() - 1); // Yesterday
    const dateStr = targetDate.toISOString().split('T')[0];

    console.log(`[Rollup] Starting daily rollup for ${dateStr}`);

    // Generate rollup using stored procedure
    await db.none(`SELECT generate_daily_rollup($1::date)`, [dateStr]);

    // Update cron heartbeat
    await db.none(`
      UPDATE cron_heartbeats 
      SET last_ok = NOW(), last_message = $2
      WHERE name = $1
    `, ['rollups', `Successfully generated rollup for ${dateStr}`]);

    // Get the generated rollup
    const rollup = await db.oneOrNone(`
      SELECT * FROM revenue_rollups WHERE date = $1
    `, [dateStr]);

    if (!rollup) {
      throw new Error('Rollup generation failed - no record created');
    }

    // Send summary to Slack if configured
    if (rollup.high_risk_calls > 0 || rollup.lost_premium > 0) {
      try {
        const { postSlack } = await import('@/server/lib/alerts');
        
        const blocks: any[] = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `📊 Daily Revenue Report - ${dateStr}`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Total Calls:*\n${rollup.total_calls}`
              },
              {
                type: 'mrkdwn',
                text: `*Avg Duration:*\n${Math.floor(rollup.avg_duration_sec / 60)}m ${Math.round(rollup.avg_duration_sec % 60)}s`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Active Premium:*\n$${rollup.active_premium.toLocaleString()}/mo`
              },
              {
                type: 'mrkdwn',
                text: `*At Risk Premium:*\n$${rollup.at_risk_premium.toLocaleString()}/mo`
              }
            ]
          }
        ];

        if (rollup.lost_premium > 0) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⚠️ *Lost Premium:* $${rollup.lost_premium.toLocaleString()}/mo from ${rollup.cancellation_requests} cancellations`
            }
          });
        }

        if (rollup.high_risk_calls > 0) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *High Risk Calls:* ${rollup.high_risk_calls} (${rollup.escalations} escalations, ${rollup.refund_requests} refund requests)`
            }
          });
        }

        blocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Avg QA Score:*\n${rollup.avg_qa_score.toFixed(1)}`
            },
            {
              type: 'mrkdwn',
              text: `*Top Agent:*\n${rollup.top_agent_name} (${rollup.top_agent_calls} calls)`
            }
          ]
        });

        await postSlack({
          text: `Daily Revenue Report for ${dateStr}`,
          blocks
        });
      } catch (slackError) {
        console.error('[Rollup] Slack notification failed:', slackError);
      }
    }

    const processingTime = Date.now() - startTime;

    // Update processing time
    await db.none(`
      UPDATE revenue_rollups 
      SET processing_time_ms = $1 
      WHERE date = $2
    `, [processingTime, dateStr]);

    console.log(`[Rollup] Completed in ${processingTime}ms`);

    return NextResponse.json({
      ok: true,
      date: dateStr,
      metrics: {
        total_calls: rollup.total_calls,
        unique_customers: rollup.unique_customers,
        active_premium: rollup.active_premium,
        at_risk_premium: rollup.at_risk_premium,
        lost_premium: rollup.lost_premium,
        high_risk_calls: rollup.high_risk_calls,
        avg_qa_score: rollup.avg_qa_score
      },
      processing_time_ms: processingTime
    });

  } catch (error: any) {
    console.error('[Rollup] Error:', error);
    
    return NextResponse.json({
      ok: false,
      error: error.message || 'Rollup generation failed',
      processing_time_ms: Date.now() - startTime
    }, { status: 500 });
  }
}