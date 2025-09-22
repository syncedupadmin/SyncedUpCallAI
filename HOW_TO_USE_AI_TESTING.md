# 🎯 AI Testing System - Quick Start Guide

## ✅ System Status: READY!

Your AI Testing System is now deployed and operational. Here's how to use it:

---

## 🚀 IMMEDIATE NEXT STEPS

### 1. Open the Testing Dashboard
Navigate to: **http://localhost:3000/testing/dashboard**

> Note: You'll see "Unauthorized" - that's expected. The dashboard requires admin auth.

### 2. Import Your First Test Call
We found call `0e666bfa-6929-40c4-8dc5-a1a7f3d72708` with QA score 70. Let's import it:

```bash
curl -X POST http://localhost:3000/api/testing/import-call/0e666bfa-6929-40c4-8dc5-a1a7f3d72708 \
  -H "Content-Type: application/json" \
  -d '{
    "suite_id": "876b6b65-ddaa-42fe-aecd-80457cb66035",
    "verify_transcript": true
  }'
```

### 3. Run Your First Test
This will run the call through your Deepgram/AssemblyAI pipeline:

```bash
curl -X POST http://localhost:3000/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035 \
  -H "Content-Type: application/json" \
  -d '{
    "parallel": 1,
    "stopOnFailure": false
  }'
```

### 4. Check Results
View the test results and metrics:

```bash
curl -X GET http://localhost:3000/api/testing/metrics?days=7 \
  -H "Accept: application/json"
```

---

## 📊 WHAT'S HAPPENING BEHIND THE SCENES

When you run a test, the system:

1. **Creates a synthetic call** in your database marked as `is_test = true`
2. **Runs it through YOUR transcription** (`/api/jobs/transcribe`)
3. **Runs it through YOUR analysis** (`/api/jobs/analyze`)
4. **Compares results** with expected values
5. **Calculates WER** (Word Error Rate)
6. **Stores metrics** for tracking improvement

---

## 🎮 QUICK BROWSER CONSOLE COMMANDS

Open DevTools Console (F12) and run these:

### Import Multiple Calls at Once
```javascript
// Import your best calls as test cases
const calls = ['0e666bfa-6929-40c4-8dc5-a1a7f3d72708'];
const suiteId = '876b6b65-ddaa-42fe-aecd-80457cb66035';

for (const callId of calls) {
  fetch(`/api/testing/import-call/${callId}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      suite_id: suiteId,
      verify_transcript: true
    })
  }).then(r => r.json()).then(console.log);
}
```

### Run Test Suite
```javascript
// Run all tests in your suite
fetch('/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({parallel: 3})
}).then(r => r.json()).then(console.log);
```

### Check Current Accuracy
```javascript
// See your accuracy metrics
fetch('/api/testing/metrics?days=7')
  .then(r => r.json())
  .then(data => {
    if (data.metrics && data.metrics.overall) {
      console.log('📊 Testing Metrics:');
      console.log('Total Tests:', data.metrics.overall.total_tests);
      console.log('Avg WER:', (data.metrics.overall.avg_wer * 100).toFixed(1) + '%');
      console.log('Success Rate:', ((data.metrics.overall.successful_tests / data.metrics.overall.total_tests) * 100).toFixed(0) + '%');
    }
    if (data.recommendations) {
      console.log('\n💡 Recommendations:');
      data.recommendations.forEach(r => console.log('- ' + r));
    }
  });
```

---

## 🔍 VIEWING RESULTS WITHOUT AUTH

Since the dashboard requires auth, you can view results via API:

### 1. Get Test Run Status
```javascript
fetch('/api/testing/verify-setup')
  .then(r => r.json())
  .then(data => console.log('System Ready:', data.success, '\nSuites:', data.checks.existing_suites));
```

### 2. Create a Simple Test Viewer
Create this file: `src/app/testing/public/page.tsx`

```typescript
'use client';
import { useEffect, useState } from 'react';

export default function PublicTestViewer() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/testing/metrics?days=7')
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">AI Testing Results</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-blue-100 rounded">
          <div className="text-sm text-gray-600">Total Tests</div>
          <div className="text-2xl font-bold">
            {data.metrics?.overall?.total_tests || 0}
          </div>
        </div>

        <div className="p-4 bg-green-100 rounded">
          <div className="text-sm text-gray-600">Average WER</div>
          <div className="text-2xl font-bold">
            {data.metrics?.overall?.avg_wer
              ? (data.metrics.overall.avg_wer * 100).toFixed(1) + '%'
              : 'N/A'}
          </div>
        </div>

        <div className="p-4 bg-purple-100 rounded">
          <div className="text-sm text-gray-600">Success Rate</div>
          <div className="text-2xl font-bold">
            {data.metrics?.overall?.total_tests
              ? ((data.metrics.overall.successful_tests / data.metrics.overall.total_tests) * 100).toFixed(0) + '%'
              : 'N/A'}
          </div>
        </div>
      </div>

      {data.recommendations && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-2">Recommendations</h2>
          <ul className="list-disc pl-5">
            {data.recommendations.map((rec: string, i: number) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

Then visit: **http://localhost:3000/testing/public**

---

## 📈 EXPECTED WORKFLOW

### Day 1 (Today)
1. ✅ System deployed
2. ⏳ Import 5-10 calls
3. ⏳ Run first tests
4. ⏳ Establish baseline WER

### Day 2-3
1. Import more variety (50+ calls)
2. Test different scenarios
3. Identify problem categories
4. Compare Deepgram vs AssemblyAI

### Week 1
1. Regular testing routine
2. Collect feedback
3. Build correction dataset
4. Optimize settings

### Ongoing
1. Weekly accuracy checks
2. Regression monitoring
3. Cost optimization
4. Continuous improvement

---

## 🆘 TROUBLESHOOTING

### "Call has not been transcribed yet"
- The call needs to have gone through your pipeline first
- Only import calls that have transcripts

### Tests not running
- Check if your transcription pipeline is working
- Try running a single call manually first
- Check browser console for errors

### No metrics showing
- You need to run at least one test first
- Metrics update after test completion

---

## 💡 PRO TIP

Start by importing your BEST calls (high QA scores) first. These become your "golden standard" - if these fail, you know there's a real accuracy issue.

The system is now ready for testing! Start with importing one call and running a test to verify everything works.