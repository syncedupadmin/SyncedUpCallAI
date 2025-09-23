import { Client } from "pg";
import pLimit from "p-limit";
import { runTestCase } from "./test-runner.js";

const DB = process.env.DATABASE_URL!;

export async function runSuite({ suite_id, limit=100, parallel=10 }:{
  suite_id: string; limit?: number; parallel?: number;
}){
  const client = new Client({ connectionString: DB }); await client.connect();
  const { rows: suite } = await client.query(
    "insert into ai_suite_runs (suite_id, status, started_at) values ($1,'running', now()) returning id",
    [suite_id]
  );
  const suite_run_id = suite[0].id;

  try {
    const { rows: tests } = await client.query(
      "select id from ai_test_cases where suite_id=$1 limit $2",
      [suite_id, limit]
    );
    const limitP = pLimit(parallel);
    await Promise.all(tests.map(t => limitP(()=>runTestCase({ test_case_id: t.id, suite_run_id }))));

    await client.query("update ai_suite_runs set status='completed', completed_at=now() where id=$1", [suite_run_id]);
  } catch (e:any) {
    await client.query("update ai_suite_runs set status='failed', completed_at=now() where id=$1", [suite_run_id]);
    throw e;
  } finally {
    await client.end();
  }
}