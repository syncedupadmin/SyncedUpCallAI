#!/usr/bin/env node

/**
 * Seed Script for Revenue Rollups
 * Generates rollup data for the last 14 days based on existing calls
 */

const pg = require('pg');

// Database connection
const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function seedRollups() {
  console.log('🌱 Starting rollups seed...\n');
  
  try {
    // Generate rollups for the last 14 days
    const days = 14;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    console.log(`Generating rollups from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    let inserted = 0;
    let updated = 0;
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const nextDateStr = new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Calculate metrics for this day
      const metrics = await pool.query(`
        SELECT 
          COUNT(DISTINCT c.id) as total_calls,
          COUNT(DISTINCT a.call_id) as analyzed_calls,
          COUNT(DISTINCT CASE WHEN a.qa_score >= 70 THEN a.call_id END) as success_calls,
          COALESCE(SUM(CASE WHEN a.qa_score >= 70 THEN FLOOR(RANDOM() * 50000 + 10000) ELSE 0 END), 0) as revenue_cents
        FROM calls c
        LEFT JOIN analyses a ON a.call_id = c.id
        WHERE c.started_at >= $1 AND c.started_at < $2
      `, [dateStr, nextDateStr]);
      
      const { total_calls, analyzed_calls, success_calls, revenue_cents } = metrics.rows[0];
      
      // Insert or update rollup
      const result = await pool.query(`
        INSERT INTO revenue_rollups (date, total_calls, analyzed_calls, success_calls, revenue_cents)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (date) DO UPDATE SET
          total_calls = EXCLUDED.total_calls,
          analyzed_calls = EXCLUDED.analyzed_calls,
          success_calls = EXCLUDED.success_calls,
          revenue_cents = EXCLUDED.revenue_cents,
          created_at = NOW()
        RETURNING date, (xmax = 0) as inserted
      `, [dateStr, total_calls || 0, analyzed_calls || 0, success_calls || 0, revenue_cents || 0]);
      
      if (result.rows[0].inserted) {
        inserted++;
        console.log(`  ✓ Inserted rollup for ${dateStr}: ${total_calls} calls, $${(revenue_cents / 100).toFixed(2)} revenue`);
      } else {
        updated++;
        console.log(`  ↻ Updated rollup for ${dateStr}: ${total_calls} calls, $${(revenue_cents / 100).toFixed(2)} revenue`);
      }
    }
    
    console.log('\n📊 Rollup Summary:');
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Updated: ${updated}`);
    
    // Verify the seed
    const verification = await pool.query(`
      SELECT 
        COUNT(*) as days,
        SUM(total_calls) as total_calls,
        SUM(analyzed_calls) as analyzed_calls,
        SUM(success_calls) as success_calls,
        SUM(revenue_cents) as total_revenue_cents
      FROM revenue_rollups
      WHERE date >= $1 AND date <= $2
    `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
    
    const stats = verification.rows[0];
    console.log('\n✅ Rollup seed completed!');
    console.log('  Summary for last 14 days:');
    console.log(`    Days with data: ${stats.days}`);
    console.log(`    Total calls: ${stats.total_calls || 0}`);
    console.log(`    Analyzed calls: ${stats.analyzed_calls || 0}`);
    console.log(`    Success calls: ${stats.success_calls || 0}`);
    console.log(`    Total revenue: $${((stats.total_revenue_cents || 0) / 100).toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedRollups().then(() => process.exit(0));
}

module.exports = { seedRollups };