import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Analyze impact of specific keywords
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keywords, configId } = await request.json();

    // If specific keywords provided, analyze those
    if (keywords && keywords.length > 0) {
      const keywordAnalysis = [];

      for (const keyword of keywords) {
        const [word, boost] = keyword.split(':');

        // Get or create keyword metric
        const metric = await db.oneOrNone(`
          SELECT
            keyword,
            boost_value,
            times_detected,
            times_missed,
            accuracy_impact,
            recommendation,
            is_harmful,
            is_beneficial,
            last_tested
          FROM ai_keyword_metrics
          WHERE keyword = $1
        `, [word]);

        if (metric) {
          keywordAnalysis.push({
            keyword: word,
            boost: parseInt(boost || '1'),
            impact: metric.accuracy_impact || 0,
            timesDetected: metric.times_detected || 0,
            timesMissed: metric.times_missed || 0,
            status: metric.is_harmful ? 'harmful' : metric.is_beneficial ? 'beneficial' : 'neutral',
            recommendation: metric.recommendation || 'test_more',
            lastTested: metric.last_tested
          });
        } else {
          // New keyword, no data yet
          keywordAnalysis.push({
            keyword: word,
            boost: parseInt(boost || '1'),
            impact: 0,
            timesDetected: 0,
            timesMissed: 0,
            status: 'untested',
            recommendation: 'test_more',
            lastTested: null
          });
        }
      }

      return NextResponse.json({
        success: true,
        analysis: keywordAnalysis,
        summary: {
          total: keywordAnalysis.length,
          harmful: keywordAnalysis.filter(k => k.status === 'harmful').length,
          beneficial: keywordAnalysis.filter(k => k.status === 'beneficial').length,
          neutral: keywordAnalysis.filter(k => k.status === 'neutral').length,
          untested: keywordAnalysis.filter(k => k.status === 'untested').length
        }
      });
    }

    // If configId provided, analyze all keywords in that config
    if (configId) {
      const config = await db.oneOrNone(
        'SELECT config FROM ai_configurations WHERE id = $1',
        [configId]
      );

      if (!config) {
        return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
      }

      const configKeywords = config.config.keywords || [];
      const keywordAnalysis = [];

      for (const keyword of configKeywords) {
        const [word, boost] = keyword.split(':');

        const metric = await db.oneOrNone(`
          SELECT
            keyword,
            boost_value,
            times_detected,
            times_missed,
            accuracy_impact,
            recommendation,
            is_harmful,
            is_beneficial,
            last_tested
          FROM ai_keyword_metrics
          WHERE keyword = $1
        `, [word]);

        if (metric) {
          keywordAnalysis.push({
            keyword: word,
            boost: parseInt(boost || '1'),
            impact: metric.accuracy_impact || 0,
            timesDetected: metric.times_detected || 0,
            timesMissed: metric.times_missed || 0,
            status: metric.is_harmful ? 'harmful' : metric.is_beneficial ? 'beneficial' : 'neutral',
            recommendation: metric.recommendation || 'test_more',
            lastTested: metric.last_tested
          });
        } else {
          keywordAnalysis.push({
            keyword: word,
            boost: parseInt(boost || '1'),
            impact: 0,
            timesDetected: 0,
            timesMissed: 0,
            status: 'untested',
            recommendation: 'test_more',
            lastTested: null
          });
        }
      }

      // Sort by impact (worst first)
      keywordAnalysis.sort((a, b) => a.impact - b.impact);

      // Get problematic keywords to remove
      const toRemove = keywordAnalysis
        .filter(k => k.status === 'harmful' || k.impact < -2)
        .slice(0, 10);

      // Get beneficial keywords to keep
      const toKeep = keywordAnalysis
        .filter(k => k.status === 'beneficial' || k.impact > 2);

      return NextResponse.json({
        success: true,
        configId,
        totalKeywords: configKeywords.length,
        analysis: keywordAnalysis,
        recommendations: {
          toRemove: toRemove.map(k => k.keyword),
          toKeep: toKeep.map(k => k.keyword),
          toTest: keywordAnalysis.filter(k => k.status === 'untested').map(k => k.keyword)
        },
        summary: {
          total: keywordAnalysis.length,
          harmful: keywordAnalysis.filter(k => k.status === 'harmful').length,
          beneficial: keywordAnalysis.filter(k => k.status === 'beneficial').length,
          neutral: keywordAnalysis.filter(k => k.status === 'neutral').length,
          untested: keywordAnalysis.filter(k => k.status === 'untested').length,
          averageImpact: keywordAnalysis.reduce((sum, k) => sum + k.impact, 0) / keywordAnalysis.length
        }
      });
    }

    // Get all problematic keywords from database
    const problematicKeywords = await db.manyOrNone(`
      SELECT
        keyword,
        boost_value,
        accuracy_impact,
        times_detected,
        times_missed,
        recommendation
      FROM ai_keyword_metrics
      WHERE is_harmful = true
      ORDER BY accuracy_impact ASC
      LIMIT 50
    `);

    return NextResponse.json({
      success: true,
      problematicKeywords: problematicKeywords.map(k => ({
        keyword: k.keyword,
        boost: k.boost_value,
        impact: k.accuracy_impact,
        recommendation: k.recommendation
      })),
      message: 'Provide keywords array or configId to analyze specific keywords'
    });

  } catch (error: any) {
    console.error('Keyword analysis failed:', error);
    return NextResponse.json(
      { error: 'Keyword analysis failed', message: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint for retrieving all keyword metrics
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all keyword metrics
    const allKeywords = await db.manyOrNone(`
      SELECT
        keyword,
        boost_value,
        times_detected,
        times_missed,
        accuracy_impact,
        recommendation,
        is_harmful,
        is_beneficial,
        added_date,
        last_tested
      FROM ai_keyword_metrics
      ORDER BY accuracy_impact ASC
    `);

    const harmful = allKeywords.filter(k => k.is_harmful);
    const beneficial = allKeywords.filter(k => k.is_beneficial);
    const neutral = allKeywords.filter(k => !k.is_harmful && !k.is_beneficial);

    return NextResponse.json({
      success: true,
      metrics: {
        total: allKeywords.length,
        harmful: harmful.length,
        beneficial: beneficial.length,
        neutral: neutral.length
      },
      keywords: {
        harmful: harmful.slice(0, 20),
        beneficial: beneficial.slice(0, 20),
        neutral: neutral.slice(0, 20),
        all: allKeywords
      }
    });

  } catch (error: any) {
    console.error('Failed to get keyword metrics:', error);
    return NextResponse.json(
      { error: 'Failed to get keyword metrics', message: error.message },
      { status: 500 }
    );
  }
}