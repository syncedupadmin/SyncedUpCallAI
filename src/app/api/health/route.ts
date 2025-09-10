import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // prevent prerendering

export async function GET() {
  // Very lightweight health info (no DB call required)
  const now = new Date().toISOString();

  // Report presence (not values) of critical env vars
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    CONVOSO_WEBHOOK_SECRET: Boolean(process.env.CONVOSO_WEBHOOK_SECRET),
    JOBS_SECRET: Boolean(process.env.JOBS_SECRET),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    DEEPGRAM_API_KEY: Boolean(process.env.DEEPGRAAM_API_KEY || process.env.DEEPGRAM_API_KEY),
    ASSEMBLYAI_API_KEY: Boolean(process.env.ASSEMBLYAI_API_KEY),
  };

  // Optional Vercel metadata if available
  const meta = {
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };

  return NextResponse.json({ ok: true, now, env, meta });
}