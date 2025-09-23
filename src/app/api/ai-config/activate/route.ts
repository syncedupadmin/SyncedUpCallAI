import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Switch active configuration (with safety checks)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { configId, force = false, skipTests = false } = await request.json();

    if (!configId) {
      return NextResponse.json(
        { error: 'Configuration ID required' },
        { status: 400 }
      );
    }

    // Get configuration to activate
    const configToActivate = await db.oneOrNone(`
      SELECT
        c.*,
        (
          SELECT COUNT(*)::int
          FROM ai_config_tests
          WHERE config_id = c.id
        ) as test_count,
        (
          SELECT AVG(accuracy)
          FROM ai_config_tests
          WHERE config_id = c.id
        ) as avg_test_accuracy
      FROM ai_configurations c
      WHERE c.id = $1
    `, [configId]);

    if (!configToActivate) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    // Get current active configuration for backup
    const currentActive = await db.oneOrNone(`
      SELECT * FROM ai_configurations
      WHERE is_active = true
    `);

    // Safety checks
    const safetyChecks = {
      hasTests: configToActivate.test_count >= 3,
      accuracyAcceptable: configToActivate.avg_test_accuracy >= 70,
      notOvertuned: configToActivate.keywords_count <= 40,
      tested: configToActivate.test_count > 0
    };

    const warnings = [];
    const errors = [];

    // Check if configuration has been tested
    if (!skipTests && !safetyChecks.tested) {
      errors.push('Configuration has not been tested. Run at least 3 tests before activation.');
    }

    // Check minimum test requirement
    if (!skipTests && !safetyChecks.hasTests) {
      warnings.push(`Only ${configToActivate.test_count} test(s) run. Recommended: 3+ tests.`);
      if (!force) {
        errors.push('Insufficient testing. Use force=true to override or run more tests.');
      }
    }

    // Check accuracy threshold
    if (configToActivate.avg_test_accuracy && !safetyChecks.accuracyAcceptable) {
      warnings.push(`Average test accuracy is ${configToActivate.avg_test_accuracy.toFixed(1)}% (threshold: 70%)`);
      if (!force && configToActivate.avg_test_accuracy < 60) {
        errors.push('Accuracy too low. Use force=true to override or improve configuration.');
      }
    }

    // Check for over-tuning
    if (!safetyChecks.notOvertuned) {
      warnings.push(`Configuration has ${configToActivate.keywords_count} keywords (recommended: <10, max: 40)`);
      if (configToActivate.keywords_count > 60 && !force) {
        errors.push('Severe over-tuning detected. Use force=true to override.');
      }
    }

    // Compare with current active
    let performanceComparison = null;
    if (currentActive) {
      const accuracyDelta = (configToActivate.accuracy_score || 0) - (currentActive.accuracy_score || 0);
      performanceComparison = {
        currentAccuracy: currentActive.accuracy_score,
        newAccuracy: configToActivate.accuracy_score,
        delta: accuracyDelta,
        improvement: accuracyDelta > 0
      };

      if (accuracyDelta < -10) {
        warnings.push(`This will decrease accuracy by ${Math.abs(accuracyDelta).toFixed(1)}%`);
        if (accuracyDelta < -20 && !force) {
          errors.push('Significant accuracy decrease expected. Use force=true to override.');
        }
      }
    }

    // If there are blocking errors and force is not true, abort
    if (errors.length > 0 && !force) {
      return NextResponse.json({
        success: false,
        errors,
        warnings,
        safetyChecks,
        performanceComparison,
        message: 'Activation blocked due to safety checks. Review errors and warnings.',
        canForce: true
      }, { status: 400 });
    }

    // Create backup of current configuration
    let backupId = null;
    if (currentActive) {
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
          custom_vocabulary_count,
          created_by,
          parent_config_id,
          performance_delta
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        `Backup: ${currentActive.name} (${new Date().toISOString()})`,
        `Automatic backup before activating ${configToActivate.name}`,
        currentActive.config,
        false,
        currentActive.accuracy_score,
        currentActive.word_error_rate,
        currentActive.keywords_count,
        currentActive.replacements_count,
        currentActive.custom_vocabulary_count,
        user.id,
        currentActive.id,
        currentActive.performance_delta
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

    // Activate new configuration
    await db.none(`
      UPDATE ai_configurations
      SET is_active = true,
          activated_at = NOW()
      WHERE id = $1
    `, [configId]);

    // Log activation event
    console.log(`Configuration ${configToActivate.name} activated by user ${user.id}`);

    return NextResponse.json({
      success: true,
      activated: true,
      configId,
      configName: configToActivate.name,
      previousConfigId: currentActive?.id,
      previousConfigName: currentActive?.name,
      backupId,
      warnings: warnings.length > 0 ? warnings : undefined,
      forced: force && errors.length > 0,
      safetyChecks,
      performanceComparison,
      message: force && errors.length > 0
        ? 'Configuration force-activated despite safety warnings'
        : 'Configuration activated successfully',
      rollbackAvailable: true,
      rollbackCommand: backupId ? `POST /api/ai-config/activate with configId: ${backupId}` : null
    });

  } catch (error: any) {
    console.error('Failed to activate configuration:', error);
    return NextResponse.json(
      { error: 'Failed to activate configuration', message: error.message },
      { status: 500 }
    );
  }
}