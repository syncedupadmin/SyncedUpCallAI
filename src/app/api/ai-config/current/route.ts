import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Returns the active configuration with analysis
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active configuration
    const activeConfig = await db.oneOrNone(`
      SELECT
        c.*,
        (
          SELECT COUNT(*)::int
          FROM jsonb_array_elements_text(c.config->'keywords')
        ) as actual_keywords_count,
        (
          SELECT COUNT(*)::int
          FROM jsonb_object_keys(c.config->'replacements')
        ) as actual_replacements_count
      FROM ai_configurations c
      WHERE c.is_active = true
      LIMIT 1
    `);

    if (!activeConfig) {
      // No active config, return factory default
      const factoryDefault = await db.one(`
        SELECT * FROM ai_configurations
        WHERE is_factory_default = true
        LIMIT 1
      `);

      return NextResponse.json({
        config: factoryDefault,
        analysis: {
          totalKeywords: 0,
          totalReplacements: 0,
          addedSinceDefault: 0,
          accuracyChange: 0,
          problematicKeywords: [],
          recommendedRemovals: [],
          overtuningStatus: 'optimal',
          message: 'Using factory defaults - no customizations'
        }
      });
    }

    // Get factory default for comparison
    const factoryDefault = await db.one(`
      SELECT accuracy_score, word_error_rate
      FROM ai_configurations
      WHERE is_factory_default = true
      LIMIT 1
    `);

    // Get problematic keywords
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
      LIMIT 20
    `);

    // Extract keywords from config for analysis
    const keywords = activeConfig.config.keywords || [];
    const keywordList = keywords.map((k: string) => {
      const [word, boost] = k.split(':');
      return { word, boost: parseInt(boost || '1') };
    });

    // Get recommendations for removal (top 10 most harmful)
    const recommendedRemovals = problematicKeywords
      .filter(k => k.recommendation === 'remove')
      .slice(0, 10)
      .map(k => k.keyword);

    // Calculate accuracy change
    const accuracyChange = activeConfig.accuracy_score - factoryDefault.accuracy_score;

    // Determine overtuning status
    let overtuningStatus = 'optimal';
    let message = '';

    if (activeConfig.keywords_count > 40) {
      overtuningStatus = 'critical';
      message = 'System is severely over-tuned. Immediate action required.';
    } else if (activeConfig.keywords_count > 20) {
      overtuningStatus = 'high';
      message = 'System is significantly over-tuned. Consider removing keywords.';
    } else if (activeConfig.keywords_count > 10) {
      overtuningStatus = 'medium';
      message = 'System has moderate tuning. Review keyword effectiveness.';
    } else {
      overtuningStatus = 'optimal';
      message = 'System tuning is within recommended limits.';
    }

    // Get recent test results
    const recentTests = await db.manyOrNone(`
      SELECT
        accuracy,
        wer,
        tested_at
      FROM ai_config_tests
      WHERE config_id = $1
      ORDER BY tested_at DESC
      LIMIT 5
    `, [activeConfig.id]);

    return NextResponse.json({
      config: activeConfig,
      analysis: {
        totalKeywords: activeConfig.keywords_count || 0,
        totalReplacements: activeConfig.replacements_count || 0,
        addedSinceDefault: (activeConfig.keywords_count || 0) + (activeConfig.replacements_count || 0),
        accuracyChange: parseFloat(accuracyChange.toFixed(2)),
        accuracyScore: activeConfig.accuracy_score,
        wordErrorRate: activeConfig.word_error_rate,
        problematicKeywords: problematicKeywords.map(k => ({
          keyword: k.keyword,
          impact: k.accuracy_impact,
          recommendation: k.recommendation
        })),
        recommendedRemovals,
        overtuningStatus,
        message,
        recentTests,
        performanceDelta: activeConfig.performance_delta
      }
    });

  } catch (error: any) {
    console.error('Failed to get current config:', error);
    return NextResponse.json(
      { error: 'Failed to get current configuration', message: error.message },
      { status: 500 }
    );
  }
}