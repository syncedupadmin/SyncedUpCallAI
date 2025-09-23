import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Save configuration as new version
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description, config, parentConfigId } = await request.json();

    if (!name || !config) {
      return NextResponse.json(
        { error: 'Name and configuration required' },
        { status: 400 }
      );
    }

    // Validate configuration structure
    if (!config.model) {
      return NextResponse.json(
        { error: 'Configuration must include model' },
        { status: 400 }
      );
    }

    // Count keywords and replacements
    const keywordsCount = config.keywords?.length || 0;
    const replacementsCount = config.replacements
      ? Object.keys(config.replacements).length
      : 0;
    const customVocabularyCount = config.custom_vocabulary?.length || 0;

    // Check for duplicate name
    const existing = await db.oneOrNone(
      'SELECT id FROM ai_configurations WHERE name = $1',
      [name]
    );

    if (existing) {
      return NextResponse.json(
        { error: 'Configuration with this name already exists' },
        { status: 400 }
      );
    }

    // Get baseline accuracy for performance delta calculation
    const baseline = await db.one(`
      SELECT accuracy_score
      FROM ai_configurations
      WHERE is_factory_default = true
      LIMIT 1
    `);

    // Save configuration (NOT active by default for safety)
    const newConfig = await db.one(`
      INSERT INTO ai_configurations (
        name,
        description,
        config,
        is_active,
        keywords_count,
        replacements_count,
        custom_vocabulary_count,
        created_by,
        parent_config_id,
        performance_delta
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, created_at
    `, [
      name,
      description || `Configuration created on ${new Date().toLocaleDateString()}`,
      JSON.stringify(config),
      false, // Never activate automatically
      keywordsCount,
      replacementsCount,
      customVocabularyCount,
      user.id,
      parentConfigId || null,
      0 // Will be updated after testing
    ]);

    // If keywords were added, update keyword metrics
    if (config.keywords && config.keywords.length > 0) {
      for (const keyword of config.keywords) {
        const [word, boost] = keyword.split(':');
        await db.none(`
          INSERT INTO ai_keyword_metrics (
            keyword,
            boost_value,
            added_by,
            config_ids
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (keyword) DO UPDATE SET
            config_ids = array_append(
              COALESCE(ai_keyword_metrics.config_ids, '{}'),
              $5
            )
        `, [
          word,
          parseInt(boost || '1'),
          user.id,
          [newConfig.id],
          newConfig.id
        ]);
      }
    }

    // Check if configuration might be over-tuned
    const warnings = [];
    if (keywordsCount > 40) {
      warnings.push('Critical: Configuration has too many keywords (>40). This will likely hurt accuracy.');
    } else if (keywordsCount > 20) {
      warnings.push('Warning: Configuration has many keywords (>20). Consider reducing for better accuracy.');
    } else if (keywordsCount > 10) {
      warnings.push('Notice: Configuration has moderate keywords (>10). Monitor performance carefully.');
    }

    if (replacementsCount > 20) {
      warnings.push('Warning: Many text replacements may affect transcription quality.');
    }

    return NextResponse.json({
      success: true,
      configId: newConfig.id,
      configName: newConfig.name,
      createdAt: newConfig.created_at,
      statistics: {
        keywordsCount,
        replacementsCount,
        customVocabularyCount,
        totalCustomizations: keywordsCount + replacementsCount + customVocabularyCount
      },
      warnings,
      message: warnings.length > 0
        ? 'Configuration saved with warnings. Test thoroughly before activation.'
        : 'Configuration saved successfully. Test before activation.',
      requiresTesting: true,
      minimumTestsRequired: 3
    });

  } catch (error: any) {
    console.error('Failed to save configuration:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration', message: error.message },
      { status: 500 }
    );
  }
}