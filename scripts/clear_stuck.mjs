import { Client } from "pg"; const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`update ai_suite_runs set status='failed' where status='running' and started_at < now() - interval '30 minutes'`);
await c.end(); console.log("Cleared old running suites.");