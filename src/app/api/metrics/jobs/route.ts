import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withRetry } from '@/server/lib/db-utils';
import { logInfo, logError } from '@/lib/log';

export const dynamic = 'force-dynamic';

interface JobMetrics {
  timestamp: string;
  recording_queue: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retry_pending: number;
    avg_processing_time_ms?: number;
    oldest_pending?: Date;
    stale_count: number;
  };
  transcription_queue: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    avg_duration_seconds?: number;
    success_rate: number;
  };
  analysis_jobs: {
    total_last_hour: number;
    completed: number;
    failed: number;
    avg_analysis_time_ms?: number;
  };
  throughput: {
    recordings_per_minute: number;
    transcriptions_per_minute: number;
    analyses_per_minute: number;
  };
  backlog: {
    recordings_backlog_hours?: number;
    transcriptions_backlog_hours?: number;
    critical_backlog: boolean;
  };
}

async function getRecordingQueueMetrics() {
  try {
    const metrics = await withRetry(() => db.one(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'retry') as retry_pending,
        COUNT(*) FILTER (WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes') as stale_count,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) FILTER (WHERE status = 'completed') as avg_processing_time,
        MIN(created_at) FILTER (WHERE status = 'pending') as oldest_pending
      FROM recording_queue
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `));

    return {
      total: parseInt(metrics.total || '0'),
      pending: parseInt(metrics.pending || '0'),
      processing: parseInt(metrics.processing || '0'),
      completed: parseInt(metrics.completed || '0'),
      failed: parseInt(metrics.failed || '0'),
      retry_pending: parseInt(metrics.retry_pending || '0'),
      avg_processing_time_ms: metrics.avg_processing_time ? parseFloat(metrics.avg_processing_time) : undefined,
      oldest_pending: metrics.oldest_pending,
      stale_count: parseInt(metrics.stale_count || '0'),
    };
  } catch (error: any) {
    logError('Failed to get recording queue metrics', { error: error.message });
    return {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retry_pending: 0,
      stale_count: 0,
    };
  }
}

async function getTranscriptionQueueMetrics() {
  try {
    const metrics = await withRetry(() => db.one(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE transcription_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE transcription_status = 'processing') as processing,
        COUNT(*) FILTER (WHERE transcription_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE transcription_status = 'failed') as failed,
        AVG(duration_seconds) FILTER (WHERE transcription_status = 'completed') as avg_duration,
        COUNT(*) FILTER (WHERE transcription_status = 'completed')::FLOAT / NULLIF(COUNT(*), 0) as success_rate
      FROM calls
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND duration_seconds > 10
    `));

    return {
      total: parseInt(metrics.total || '0'),
      pending: parseInt(metrics.pending || '0'),
      processing: parseInt(metrics.processing || '0'),
      completed: parseInt(metrics.completed || '0'),
      failed: parseInt(metrics.failed || '0'),
      avg_duration_seconds: metrics.avg_duration ? parseFloat(metrics.avg_duration) : undefined,
      success_rate: parseFloat(metrics.success_rate || '0'),
    };
  } catch (error: any) {
    logError('Failed to get transcription queue metrics', { error: error.message });
    return {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      success_rate: 0,
    };
  }
}

async function getAnalysisJobMetrics() {
  try {
    const metrics = await withRetry(() => db.one(`
      SELECT
        COUNT(*) as total_last_hour,
        COUNT(*) FILTER (WHERE analysis_completed = true) as completed,
        COUNT(*) FILTER (WHERE analysis_completed = false AND transcript IS NOT NULL) as failed,
        AVG(EXTRACT(EPOCH FROM (analysis_completed_at - transcript_completed_at)) * 1000)
          FILTER (WHERE analysis_completed = true) as avg_analysis_time
      FROM calls
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND transcript IS NOT NULL
    `));

    return {
      total_last_hour: parseInt(metrics.total_last_hour || '0'),
      completed: parseInt(metrics.completed || '0'),
      failed: parseInt(metrics.failed || '0'),
      avg_analysis_time_ms: metrics.avg_analysis_time ? parseFloat(metrics.avg_analysis_time) : undefined,
    };
  } catch (error: any) {
    logError('Failed to get analysis job metrics', { error: error.message });
    return {
      total_last_hour: 0,
      completed: 0,
      failed: 0,
    };
  }
}

async function getThroughputMetrics() {
  try {
    const metrics = await withRetry(() => db.one(`
      SELECT
        (SELECT COUNT(*) FROM recording_queue WHERE updated_at > NOW() - INTERVAL '1 minute' AND status = 'completed') as recordings_per_minute,
        (SELECT COUNT(*) FROM calls WHERE transcript_completed_at > NOW() - INTERVAL '1 minute') as transcriptions_per_minute,
        (SELECT COUNT(*) FROM calls WHERE analysis_completed_at > NOW() - INTERVAL '1 minute') as analyses_per_minute
    `));

    return {
      recordings_per_minute: parseInt(metrics.recordings_per_minute || '0'),
      transcriptions_per_minute: parseInt(metrics.transcriptions_per_minute || '0'),
      analyses_per_minute: parseInt(metrics.analyses_per_minute || '0'),
    };
  } catch (error: any) {
    logError('Failed to get throughput metrics', { error: error.message });
    return {
      recordings_per_minute: 0,
      transcriptions_per_minute: 0,
      analyses_per_minute: 0,
    };
  }
}

async function getBacklogMetrics(recordingsPending: number, transcriptionsPending: number, throughput: any) {
  const recordingsBacklogHours = throughput.recordings_per_minute > 0
    ? (recordingsPending / (throughput.recordings_per_minute * 60))
    : undefined;

  const transcriptionsBacklogHours = throughput.transcriptions_per_minute > 0
    ? (transcriptionsPending / (throughput.transcriptions_per_minute * 60))
    : undefined;

  const criticalBacklog =
    (recordingsBacklogHours && recordingsBacklogHours > 2) ||
    (transcriptionsBacklogHours && transcriptionsBacklogHours > 2);

  return {
    recordings_backlog_hours: recordingsBacklogHours,
    transcriptions_backlog_hours: transcriptionsBacklogHours,
    critical_backlog: criticalBacklog || false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();

    const [recordingQueue, transcriptionQueue, analysisJobs, throughput] = await Promise.all([
      getRecordingQueueMetrics(),
      getTranscriptionQueueMetrics(),
      getAnalysisJobMetrics(),
      getThroughputMetrics(),
    ]);

    const backlog = await getBacklogMetrics(
      recordingQueue.pending,
      transcriptionQueue.pending,
      throughput
    );

    const metrics: JobMetrics = {
      timestamp: new Date().toISOString(),
      recording_queue: recordingQueue,
      transcription_queue: transcriptionQueue,
      analysis_jobs: analysisJobs,
      throughput,
      backlog,
    };

    logInfo('Job metrics collected', {
      duration: Date.now() - startTime,
      recording_pending: recordingQueue.pending,
      transcription_pending: transcriptionQueue.pending,
      critical_backlog: backlog.critical_backlog,
    });

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'no-store, no-cache',
        'X-Response-Time': `${Date.now() - startTime}ms`,
      },
    });
  } catch (error: any) {
    logError('Failed to collect job metrics', { error: error.message });

    return NextResponse.json(
      { error: 'Failed to collect metrics', message: error.message },
      { status: 500 }
    );
  }
}