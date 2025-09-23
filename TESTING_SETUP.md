# AI Testing System - Setup Guide

## 🎉 Your Testing Dashboard is Live!

Visit: https://synced-up-call-ai.vercel.app/testing/dashboard

## ✅ What's Been Completed

1. **Created a user-friendly dashboard** with buttons for all operations
2. **Built 6 API endpoints** for testing functionality:
   - `/api/testing/find-good-calls` - Finds high-quality calls from your database
   - `/api/testing/create-suite` - Creates test suites
   - `/api/testing/import-batch` - Imports calls as test cases
   - `/api/testing/run/[suiteId]` - Runs tests with Deepgram
   - `/api/testing/verify-system` - Checks system health
   - `/api/testing/metrics` - Returns dashboard metrics

3. **Implemented WER calculation** for accuracy measurement
4. **Created database schema** for testing tables

## 🚀 Quick Setup (One-Time Only)

### Step 1: Create Database Tables

Run this SQL in your Supabase SQL editor (https://supabase.com/dashboard/project/_/sql):

```sql
-- Copy the entire contents of:
-- supabase/migrations/20240124_create_testing_system.sql
```

### Step 2: Use the Dashboard

1. Go to: https://synced-up-call-ai.vercel.app/testing/dashboard
2. Log in with your credentials
3. Click the buttons in order:
   - **Initialize System** - Sets up the testing system
   - **Create Test Suite** - Creates a container for tests
   - **Import Best Calls** - Finds and imports your best calls
   - **Quick Test** - Runs a single test to verify everything works
   - **Run All Tests** - Runs all imported tests

## 📊 Features

- **No console commands needed** - Everything works with button clicks
- **Automatic call selection** - Finds calls with QA score ≥ 0.70
- **Real-time metrics** - See Average WER, Success Rate, Processing Time
- **Test results display** - View individual test results with pass/fail status
- **System status monitoring** - Check Database, Deepgram API, and overall health

## 🎯 How It Works

1. **Import**: The system finds high-quality calls from your database (QA score ≥ 0.70, duration 30-300s)
2. **Test**: Each call is re-transcribed using Deepgram nova-2 model
3. **Compare**: WER (Word Error Rate) is calculated against the original transcript
4. **Report**: Results show accuracy metrics and pass/fail status (WER ≤ 15% = pass)

## 💡 Tips

- Start with your highest QA score calls as baseline tests
- If these fail, you know there's a real accuracy issue
- Import 5-10 calls initially for quick testing
- Use "Quick Test" to verify the system before running full suites

## 🔧 Troubleshooting

If you see any errors:

1. **"Database tables don't exist"** - Run the SQL migration from Step 1
2. **"No test cases found"** - Click "Import Best Calls" first
3. **"Unauthorized"** - Make sure you're logged in
4. **"No high-quality calls found"** - Your database might not have calls with QA score ≥ 0.70

## 📝 What Each Button Does

- **Initialize System**: Creates default test suite if needed
- **Create Test Suite**: Makes a new container for organizing tests
- **Import Best Calls**: Finds top 5 calls with highest QA scores and imports them
- **Quick Test (1 Call)**: Imports and tests a single call for quick verification
- **Run All Tests**: Executes all tests in the current suite
- **Refresh Data**: Reloads metrics and system status

## ✨ Success!

Your AI testing system is now fully operational with a clean, button-based interface. No console commands needed - everything is accessible through the dashboard UI!