# API Rate Limits - Deepgram & OpenAI

## Current Configuration
- **Deepgram API Key**: Configured (ad6028587...)
- **OpenAI API Key**: Configured (sk-proj-bhNV...)
- **OpenAI Model**: gpt-4o-mini
- **Batch Size**: 20 parallel calls in discovery processor

## Deepgram Rate Limits (Typical)

### Pay-As-You-Go Plan (Most Common)
- **Concurrent Requests**: 100-200 simultaneous requests
- **Rate Limit**: No hard limit on requests/minute for most plans
- **Timeout**: 60 seconds per request (configured in code)

### Growth Plan
- **Concurrent Requests**: 500+ 
- **Rate Limit**: Higher throughput

### Check Your Plan
To see your actual limits, you need to:
1. Login to Deepgram Console: https://console.deepgram.com/
2. Go to "Settings" → "Usage & Billing"
3. Check your plan tier and rate limits

## OpenAI Rate Limits

### Tier 1 (New Accounts) - gpt-4o-mini
- **RPM (Requests Per Minute)**: 500
- **TPM (Tokens Per Minute)**: 200,000
- **Concurrent**: ~8-10 requests recommended

### Tier 2 ($50+ spent) - gpt-4o-mini
- **RPM**: 5,000
- **TPM**: 2,000,000
- **Concurrent**: ~80-100 requests safe

### Tier 3 ($100+ spent) - gpt-4o-mini
- **RPM**: 10,000
- **TPM**: 10,000,000
- **Concurrent**: ~150-200 requests safe

### Check Your Tier
1. Login to OpenAI Platform: https://platform.openai.com/
2. Go to "Settings" → "Organization" → "Limits"
3. Check your current tier and rate limits

## Current Discovery Settings

**Batch Size**: 20 parallel calls
- 20 Deepgram transcriptions in parallel
- Analysis happens AFTER transcription (not parallel with it)

## Recommendations

### Conservative (Safe for Tier 1)
- **BATCH_SIZE**: 10-15
- Reduces chance of rate limit errors
- Slightly slower but safer

### Moderate (Good for Tier 2+)
- **BATCH_SIZE**: 20 (current setting)
- Good balance of speed and safety
- Should work for most plans

### Aggressive (Tier 3 only)
- **BATCH_SIZE**: 50-100
- Much faster but may hit rate limits
- Only if you've verified high limits

## Where to Adjust

File: `src/lib/discovery/processor.ts`
Line: ~245

```typescript
const BATCH_SIZE = 20; // Change this number
```

## Testing Recommendation

Start with current setting (20) and monitor logs for:
- "Rate limit exceeded" errors
- "429 Too Many Requests" errors
- Timeout errors

If you see these, reduce BATCH_SIZE to 10-15.
