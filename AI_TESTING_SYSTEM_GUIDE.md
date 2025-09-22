# 🚀 AI Testing System - Complete Setup & Usage Guide

## 📋 Quick Overview
This system tests your EXISTING Deepgram/AssemblyAI transcription and OpenAI analysis accuracy by running test audio through your current pipeline and comparing results.

---

## 🛠️ DEPLOYMENT STEPS

### Step 1: Run the Database Migration
1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Copy ALL contents from: `supabase/migrations/add-ai-testing-system.sql`
4. Paste and click "Run"
5. You should see "Success. No rows returned"

### Step 2: Verify Migration
1. Still in SQL Editor, copy contents from: `test-ai-testing-migration.sql`
2. Run it and check all items show ✅ (not ❌)

### Step 3: Restart Your Dev Server
```bash
# Ctrl+C to stop current server
npm run dev
```

---

## 🎯 HOW TO USE THE SYSTEM

### 1️⃣ Access the Testing Dashboard
Navigate to: http://localhost:3000/testing/dashboard

### 2️⃣ Create Your First Test Suite

#### Option A: Via API (Recommended for first test)
```bash
# Create a test suite with sample scenarios
curl -X POST http://localhost:3000/api/testing/suites \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Transcription Accuracy Test",
    "description": "Testing Deepgram vs AssemblyAI accuracy",
    "test_type": "transcription",
    "generate_defaults": true
  }'
```

#### Option B: Import Your Best Real Calls as Tests
```bash
# First, find a high-quality call from your system
# Then import it as a test case:

curl -X POST http://localhost:3000/api/testing/import-call/YOUR_CALL_ID \
  -H "Content-Type: application/json" \
  -d '{
    "suite_id": "SUITE_ID_FROM_ABOVE",
    "verify_transcript": true
  }'
```

### 3️⃣ Run Tests

1. **From Dashboard:**
   - Go to http://localhost:3000/testing/dashboard
   - Find your test suite
   - Click "Run Suite"
   - Watch real-time progress

2. **Via API:**
```bash
curl -X POST http://localhost:3000/api/testing/run/SUITE_ID \
  -H "Content-Type: application/json" \
  -d '{
    "parallel": 5,
    "stopOnFailure": false
  }'
```

### 4️⃣ Review Results & Provide Feedback

The dashboard will show:
- **WER (Word Error Rate)**: Lower is better (0.05 = 95% accurate)
- **Side-by-side comparison**: Expected vs Actual transcript
- **Quick feedback buttons**: 👍 👎 for each result

Click on any test result to:
- See detailed comparison
- Provide corrections
- Categorize errors

### 5️⃣ View Analytics

Go to the **Metrics** tab to see:
- Overall accuracy trends
- Engine comparison (Deepgram vs AssemblyAI)
- Problem categories (accents, noise, etc.)
- Cost analysis
- Improvement recommendations

---

## 📊 UNDERSTANDING THE METRICS

### WER (Word Error Rate)
- **< 5%**: Excellent ✅
- **5-15%**: Good 👍
- **15-25%**: Fair ⚠️
- **> 25%**: Poor ❌

### Test Categories
The system tests these scenarios:
- `clear_speech` - Baseline accuracy
- `heavy_accent` - Accent handling
- `background_noise` - Noise resistance
- `technical_terms` - Domain vocabulary
- `multiple_speakers` - Speaker separation
- `phone_quality` - Compressed audio
- `voicemail` - Should be filtered out
- `wrong_number` - Should be filtered out

---

## 🔄 TYPICAL WORKFLOW

### Day 1: Establish Baseline
1. Create test suite
2. Import 50 high-quality calls
3. Run tests
4. Record baseline WER (e.g., 12%)

### Day 2-7: Identify Issues
1. Review worst performers
2. Categorize error patterns
3. Submit feedback/corrections
4. Note which engine performs better

### Week 2: Optimize
1. Adjust Deepgram/AssemblyAI settings based on data
2. Switch problem categories to better engine
3. Re-run tests
4. Measure improvement

### Ongoing: Monitor
1. Weekly test runs
2. Track accuracy trends
3. Catch regressions early
4. Build training dataset from corrections

---

## 🎮 QUICK TEST COMMANDS

### Create Test Suite with Generated Scenarios
```javascript
// Run in browser console on dashboard page
fetch('/api/testing/suites', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    name: 'Quick Accuracy Test',
    test_type: 'transcription',
    generate_defaults: true
  })
}).then(r => r.json()).then(console.log)
```

### Import Last 10 High-Quality Calls
```sql
-- Run in Supabase SQL Editor to find good calls
SELECT
  c.id,
  c.duration_sec,
  a.qa_score,
  c.agent_name
FROM calls c
JOIN analyses a ON a.call_id = c.id
WHERE a.qa_score > 85
  AND c.recording_url IS NOT NULL
  AND c.duration_sec BETWEEN 30 AND 300
ORDER BY c.created_at DESC
LIMIT 10;
```

### Run All Tests
```javascript
// Get suite ID from dashboard, then:
fetch('/api/testing/run/YOUR_SUITE_ID', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({parallel: 5})
}).then(r => r.json()).then(console.log)
```

### Check Current Accuracy
```javascript
// See your current accuracy metrics
fetch('/api/testing/metrics?days=7')
  .then(r => r.json())
  .then(data => {
    console.log('Overall WER:', (data.metrics.overall.avg_wer * 100).toFixed(1) + '%');
    console.log('Recommendations:', data.recommendations);
  })
```

---

## 🐛 TROUBLESHOOTING

### "Unauthorized" Error
- Make sure you're logged in as admin
- Check your authentication in the app

### No Test Results Showing
- Tests run through your EXISTING pipeline
- Check if `/api/jobs/transcribe` is working
- Look for errors in browser console

### Tests Taking Too Long
- Each test runs through full transcription
- Deepgram usually takes 2-5 seconds
- Reduce parallel count if overwhelming system

### Migration Failed
- Check for the specific error in Supabase
- Most likely cause: syntax error or missing dependency
- Try running migration in parts

---

## 💡 PRO TIPS

1. **Start Small**: Run 5-10 tests first to verify everything works
2. **Use Real Calls**: Your actual calls make the best test cases
3. **Test Weekly**: Regular testing catches regressions
4. **Focus on Categories**: If "heavy_accent" scores poorly, focus improvements there
5. **Compare Engines**: Let data decide between Deepgram/AssemblyAI
6. **Save Money**: Tests that consistently fail might indicate calls that shouldn't be analyzed

---

## 📈 SUCCESS METRICS

After 2 weeks, you should see:
- 📊 Clear accuracy baseline established
- 🎯 Problem areas identified
- 📈 5-10% accuracy improvement
- 💰 Cost savings from filtered calls
- 🔍 Data-driven engine selection

---

## 🆘 NEED HELP?

1. Check test results at: `/api/testing/metrics`
2. View logs in browser console
3. Check Supabase logs for SQL errors
4. Verify your transcription pipeline works manually first

The system is now ready to use! Start with creating a test suite and importing a few real calls to test.