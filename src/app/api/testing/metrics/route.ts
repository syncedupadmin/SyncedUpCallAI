import { NextResponse } from "next/server";
import { Client } from "pg";
export async function GET(){
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  const agg = await client.query(`
    select
      count(*) filter (where status='completed') as completed,
      count(*) filter (where status='failed') as failed,
      count(*) filter (where status='running') as running,
      round(avg(transcript_wer)::numeric, 4) as avg_wer
    from ai_test_runs
  `);
  await client.end();
  return NextResponse.json(agg.rows[0]);
}
