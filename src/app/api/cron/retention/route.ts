import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { applyRetentionPolicy, getRetentionStats } from '@/src/server/lib/retention';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let runId: number | null = null;

  try {
    console.log('[Retention] Starting retention policy application');

    // Get active retention policy
    const policy = await db.oneOrNone(`
      SELECT * FROM retention_policies 
      WHERE active = true 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (!policy) {
      console.log('[Retention] No active retention policy found');
      return NextResponse.json({
        ok: false,
        error: 'No active retention policy'
      }, { status: 400 });
    }

    // Create retention run record
    const run = await db.one(`
      INSERT INTO retention_runs (policy_id, status)
      VALUES ($1, 'running')
      RETURNING id
    `, [policy.id]);
    runId = run.id;

    // Update cron heartbeat
    await db.none(`
      UPDATE cron_heartbeats 
      SET last_ok = NOW(), last_message = $2
      WHERE name = $1
    `, ['retention', `Starting retention policy ${policy.id}`]);

    // Apply retention policy
    const results = await applyRetentionPolicy({
      transcriptDays: policy.transcript_days,
      analysisDays: policy.analysis_days,
      eventDays: policy.event_days,
      audioUrlDays: policy.audio_url_days,
      piiMaskingEnabled: policy.pii_masking_enabled
    });

    // Update retention run record
    await db.none(`
      UPDATE retention_runs
      SET completed_at = now(),
          transcripts_masked = $2,
          transcripts_deleted = $3,
          analyses_deleted = $4,
          events_deleted = $5,
          audio_urls_cleared = $6,
          status = 'completed'
      WHERE id = $1
    `, [
      runId,
      results.transcriptsMasked,
      results.transcriptsDeleted,
      results.analysesDeleted,
      results.eventsDeleted,
      results.audioUrlsCleared
    ]);

    const duration = Date.now() - startTime;

    // Get updated stats
    const stats = await getRetentionStats();

    // Send summary to Slack if significant changes
    const totalActions = results.transcriptsMasked + results.transcriptsDeleted + 
                        results.analysesDeleted + results.eventsDeleted + 
                        results.audioUrlsCleared;

    if (totalActions > 0) {
      try {
        const { postSlack } = await import('@/src/server/lib/alerts');
        
        const blocks: any[] = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🗑️ Data Retention Policy Applied',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Transcripts Masked:*\n${results.transcriptsMasked}`
              },
              {
                type: 'mrkdwn',
                text: `*Transcripts Deleted:*\n${results.transcriptsDeleted}`
              },
              {
                type: 'mrkdwn',
                text: `*Analyses Deleted:*\n${results.analysesDeleted}`
              },
              {
                type: 'mrkdwn',
                text: `*Audio URLs Cleared:*\n${results.audioUrlsCleared}`
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Policy: ${policy.name} | Duration: ${(duration / 1000).toFixed(1)}s`
              }
            ]
          }
        ];

        await postSlack({
          text: `Data retention applied: ${totalActions} actions taken`,
          blocks
        });
      } catch (slackError) {
        console.error('[Retention] Slack notification failed:', slackError);
      }
    }

    console.log(`[Retention] Completed in ${duration}ms`, results);

    return NextResponse.json({
      ok: true,
      run_id: runId,
      policy: policy.name,
      results,
      stats,
      duration_ms: duration
    });

  } catch (error: any) {
    console.error('[Retention] Error:', error);

    // Update retention run record with error
    if (runId) {
      await db.none(`
        UPDATE retention_runs
        SET completed_at = now(),
            error = $2,
            status = 'failed'
        WHERE id = $1
      `, [runId, error.message]);
    }

    return NextResponse.json({
      ok: false,
      error: error.message || 'Retention policy application failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
}