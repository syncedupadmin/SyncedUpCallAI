// Queue Processor Helper
// Re-exports shared functions from processor.ts for use in cron job

export { fetchRecordingUrl } from './processor';
export { type ConvosoCredentials } from './processor';

// Re-export analyzeCallWithOpenAI for queue processing
export { analyzeCallWithOpenAI } from './processor';

// Note: These functions are already implemented in processor.ts:
// - fetchRecordingUrl (line 48-78): Fetches recording URL from Convoso
// - analyzeCallWithOpenAI (line 86-135): Analyzes call with OpenAI GPT-4o-mini
