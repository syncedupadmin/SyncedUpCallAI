import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Rollback to factory defaults or previous configuration
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { target = 'factory', configId } = await request.json();

    let targetConfig;

    if (target === 'factory') {
      // Rollback to factory defaults
      targetConfig = await db.oneOrNone(`
        SELECT * FROM ai_configurations
        WHERE is_factory_default = true
        LIMIT 1
      `);

      if (!targetConfig) {
        return NextResponse.json(
          { error: 'Factory default configuration not found' },
          { status: 404 }
        );
      }
    } else if (target === 'previous') {
      // Rollback to most recent backup
      targetConfig = await db.oneOrNone(`
        SELECT * FROM ai_configurations
        WHERE name LIKE 'Backup:%'
          AND created_by = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [user.id]);

      if (!targetConfig) {
        return NextResponse.json(
          { error: 'No backup configuration found' },
          { status: 404 }
        );
      }
    } else if (configId) {
      // Rollback to specific configuration
      targetConfig = await db.oneOrNone(
        'SELECT * FROM ai_configurations WHERE id = $1',
        [configId]
      );

      if (!targetConfig) {
        return NextResponse.json(
          { error: 'Configuration not found' },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid rollback target' },
        { status: 400 }
      );
    }

    // Get current active configuration for backup
    const currentActive = await db.oneOrNone(`
      SELECT * FROM ai_configurations
      WHERE is_active = true
    `);

    // Create backup of current configuration
    let backupId = null;
    if (currentActive && !currentActive.is_factory_default) {
      const backup = await db.one(`
        INSERT INTO ai_configurations (
          name,
          description,
          config,
          is_active,
          accuracy_score,
          word_error_rate,
          keywords_count,
          replacements_count,
          created_by,
          parent_config_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        `Backup before rollback: ${currentActive.name}`,
        `Automatic backup created before rollback at ${new Date().toISOString()}`,
        currentActive.config,
        false,
        currentActive.accuracy_score,
        currentActive.word_error_rate,
        currentActive.keywords_count,
        currentActive.replacements_count,
        user.id,
        currentActive.id
      ]);
      backupId = backup.id;
    }

    // Deactivate current configuration
    if (currentActive) {
      await db.none(`
        UPDATE ai_configurations
        SET is_active = false,
            deactivated_at = NOW()
        WHERE id = $1
      `, [currentActive.id]);
    }

    // Activate target configuration
    await db.none(`
      UPDATE ai_configurations
      SET is_active = true,
          activated_at = NOW()
      WHERE id = $1
    `, [targetConfig.id]);

    // Calculate improvement
    const improvement = currentActive
      ? targetConfig.accuracy_score - currentActive.accuracy_score
      : 0;

    return NextResponse.json({
      success: true,
      rolledBackTo: {
        id: targetConfig.id,
        name: targetConfig.name,
        type: targetConfig.is_factory_default ? 'factory' : 'custom',
        accuracy: targetConfig.accuracy_score,
        keywordsCount: targetConfig.keywords_count,
        replacementsCount: targetConfig.replacements_count
      },
      previousConfig: currentActive ? {
        id: currentActive.id,
        name: currentActive.name,
        accuracy: currentActive.accuracy_score,
        backupId
      } : null,
      improvement: {
        accuracyDelta: improvement,
        message: improvement > 0
          ? `Accuracy improved by ${improvement.toFixed(1)}%`
          : improvement < 0
          ? `Accuracy decreased by ${Math.abs(improvement).toFixed(1)}%`
          : 'No accuracy change'
      },
      message: target === 'factory'
        ? 'Successfully rolled back to factory defaults'
        : 'Successfully rolled back configuration'
    });

  } catch (error: any) {
    console.error('Rollback failed:', error);
    return NextResponse.json(
      { error: 'Rollback failed', message: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint to list available rollback options
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get factory default
    const factoryDefault = await db.oneOrNone(`
      SELECT
        id,
        name,
        accuracy_score,
        keywords_count,
        created_at
      FROM ai_configurations
      WHERE is_factory_default = true
      LIMIT 1
    `);

    // Get recent backups
    const backups = await db.manyOrNone(`
      SELECT
        id,
        name,
        accuracy_score,
        keywords_count,
        replacements_count,
        created_at
      FROM ai_configurations
      WHERE name LIKE 'Backup:%'
        AND created_by = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [user.id]);

    // Get other saved configurations
    const savedConfigs = await db.manyOrNone(`
      SELECT
        id,
        name,
        accuracy_score,
        keywords_count,
        replacements_count,
        created_at,
        (
          SELECT COUNT(*)::int
          FROM ai_config_tests
          WHERE config_id = c.id
        ) as test_count
      FROM ai_configurations c
      WHERE NOT name LIKE 'Backup:%'
        AND is_factory_default = false
        AND is_active = false
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      rollbackOptions: {
        factoryDefault: factoryDefault ? {
          id: factoryDefault.id,
          name: factoryDefault.name,
          accuracy: factoryDefault.accuracy_score,
          keywords: factoryDefault.keywords_count,
          created: factoryDefault.created_at
        } : null,
        recentBackups: backups.map(b => ({
          id: b.id,
          name: b.name,
          accuracy: b.accuracy_score,
          keywords: b.keywords_count,
          replacements: b.replacements_count,
          created: b.created_at
        })),
        savedConfigurations: savedConfigs.map(c => ({
          id: c.id,
          name: c.name,
          accuracy: c.accuracy_score,
          keywords: c.keywords_count,
          replacements: c.replacements_count,
          tests: c.test_count,
          created: c.created_at
        }))
      }
    });

  } catch (error: any) {
    console.error('Failed to get rollback options:', error);
    return NextResponse.json(
      { error: 'Failed to get rollback options', message: error.message },
      { status: 500 }
    );
  }
}