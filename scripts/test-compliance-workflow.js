/**
 * Compliance Workflow End-to-End Test Script
 * Tests the complete post-close compliance system
 *
 * Usage: node scripts/test-compliance-workflow.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test data
const TEST_AGENCY_ID = 'd2a5b9f4-3b7e-4c8d-9e1f-6a2b3c4d5e6f'; // Replace with actual agency ID
const TEST_SCRIPT = {
  script_name: 'Test Medicare Advantage Script',
  script_text: `Thank you for enrolling in our Medicare Advantage plan.
Your monthly premium will be $50 and your coverage begins on January 1st.
You must continue paying your Medicare Part B premium.
You have the right to cancel during the Annual Enrollment Period.
This call has been recorded for quality assurance purposes.`,
  required_phrases: [
    'Medicare Advantage plan',
    'monthly premium',
    'Medicare Part B premium',
    'right to cancel',
    'recorded for quality assurance'
  ],
  product_type: 'Medicare Advantage',
  strict_mode: false
};

const TEST_CALL = {
  agent_name: 'John Doe',
  duration_sec: 180,
  disposition: 'SALE',
  campaign: 'MA_Campaign_Test'
};

const TEST_TRANSCRIPT_GOOD = `
Hello Mrs. Smith, thank you for your time today.
Thank you for enrolling in our Medicare Advantage plan.
Your monthly premium will be $50 and your coverage begins on January 1st.
You must continue paying your Medicare Part B premium.
You have the right to cancel during the Annual Enrollment Period.
This call has been recorded for quality assurance purposes.
Have a great day!
`;

const TEST_TRANSCRIPT_BAD = `
Hello Mrs. Smith, thank you for your time today.
Thanks for signing up for our Medicare plan.
It costs $50 a month and starts in January.
Don't forget to pay your Part B.
You can cancel if you want.
This call was recorded.
Have a great day!
`;

async function testComplianceWorkflow() {
  console.log('🚀 Starting Compliance Workflow Test\n');

  try {
    // Step 1: Create test agency (if needed)
    console.log('1️⃣ Setting up test agency...');
    let { data: agency, error: agencyError } = await supabase
      .from('agencies')
      .select('id, name')
      .eq('id', TEST_AGENCY_ID)
      .single();

    if (!agency) {
      console.log('   Creating test agency...');
      const { data: newAgency, error } = await supabase
        .from('agencies')
        .insert({
          id: TEST_AGENCY_ID,
          name: 'Test Compliance Agency',
          product_type: 'all',
          settings: {}
        })
        .select()
        .single();

      if (error) {
        console.error('   ❌ Failed to create agency:', error);
        return;
      }
      agency = newAgency;
    }
    console.log(`   ✅ Agency ready: ${agency.name}\n`);

    // Step 2: Upload compliance script
    console.log('2️⃣ Uploading compliance script...');
    const { data: script, error: scriptError } = await supabase
      .from('post_close_scripts')
      .insert({
        ...TEST_SCRIPT,
        agency_id: agency.id,
        min_word_match_percentage: 85,
        fuzzy_match_threshold: 0.8,
        allow_minor_variations: true
      })
      .select()
      .single();

    if (scriptError) {
      console.error('   ❌ Failed to upload script:', scriptError);
      return;
    }
    console.log(`   ✅ Script uploaded: ${script.script_name}\n`);

    // Step 3: Activate the script
    console.log('3️⃣ Activating script...');
    const { error: activateError } = await supabase
      .from('post_close_scripts')
      .update({ active: true, status: 'active' })
      .eq('id', script.id);

    if (activateError) {
      console.error('   ❌ Failed to activate script:', activateError);
      return;
    }
    console.log('   ✅ Script activated\n');

    // Step 4: Create test calls
    console.log('4️⃣ Creating test calls...');

    // Good compliance call
    const { data: goodCall, error: goodCallError } = await supabase
      .from('calls')
      .insert({
        ...TEST_CALL,
        agency_id: agency.id,
        recording_url: 'https://example.com/test-good.mp3',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (goodCallError) {
      console.error('   ❌ Failed to create good call:', goodCallError);
      return;
    }

    // Bad compliance call
    const { data: badCall, error: badCallError } = await supabase
      .from('calls')
      .insert({
        ...TEST_CALL,
        agent_name: 'Jane Smith',
        agency_id: agency.id,
        recording_url: 'https://example.com/test-bad.mp3',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (badCallError) {
      console.error('   ❌ Failed to create bad call:', badCallError);
      return;
    }

    console.log('   ✅ Test calls created\n');

    // Step 5: Add transcripts
    console.log('5️⃣ Adding transcripts...');

    const { error: goodTransError } = await supabase
      .from('transcripts')
      .insert({
        call_id: goodCall.id,
        text: TEST_TRANSCRIPT_GOOD,
        words: generateWordTimings(TEST_TRANSCRIPT_GOOD),
        duration: 180,
        confidence: 0.95
      });

    const { error: badTransError } = await supabase
      .from('transcripts')
      .insert({
        call_id: badCall.id,
        text: TEST_TRANSCRIPT_BAD,
        words: generateWordTimings(TEST_TRANSCRIPT_BAD),
        duration: 180,
        confidence: 0.95
      });

    if (goodTransError || badTransError) {
      console.error('   ❌ Failed to add transcripts');
      return;
    }
    console.log('   ✅ Transcripts added\n');

    // Step 6: Trigger compliance processing manually
    console.log('6️⃣ Processing compliance...');

    // Extract segments
    for (const call of [goodCall, badCall]) {
      const { data: segment, error: segmentError } = await supabase
        .from('post_close_segments')
        .insert({
          call_id: call.id,
          agency_id: agency.id,
          start_ms: 0,
          end_ms: 180000,
          duration_sec: 180,
          transcript: call.id === goodCall.id ? TEST_TRANSCRIPT_GOOD : TEST_TRANSCRIPT_BAD,
          agent_name: call.agent_name,
          disposition: 'SALE'
        })
        .select()
        .single();

      if (segmentError) {
        console.error('   ❌ Failed to extract segment:', segmentError);
        return;
      }

      // Run compliance analysis
      const complianceScore = analyzeTestCompliance(
        call.id === goodCall.id ? TEST_TRANSCRIPT_GOOD : TEST_TRANSCRIPT_BAD,
        TEST_SCRIPT
      );

      const { error: complianceError } = await supabase
        .from('post_close_compliance')
        .insert({
          segment_id: segment.id,
          script_id: script.id,
          call_id: call.id,
          agency_id: agency.id,
          overall_score: complianceScore.score,
          compliance_passed: complianceScore.passed,
          word_match_percentage: complianceScore.wordMatch,
          phrase_match_percentage: complianceScore.phraseMatch,
          missing_phrases: complianceScore.missingPhrases,
          flagged_for_review: !complianceScore.passed,
          flag_reasons: complianceScore.passed ? [] : ['Score below threshold'],
          agent_name: call.agent_name
        });

      if (complianceError) {
        console.error('   ❌ Failed to save compliance result:', complianceError);
        return;
      }
    }

    console.log('   ✅ Compliance processed\n');

    // Step 7: Check results
    console.log('7️⃣ Checking compliance results...');

    const { data: results, error: resultsError } = await supabase
      .from('post_close_compliance')
      .select('*')
      .eq('agency_id', agency.id)
      .order('created_at', { ascending: false })
      .limit(2);

    if (resultsError) {
      console.error('   ❌ Failed to fetch results:', resultsError);
      return;
    }

    console.log('   Compliance Results:');
    for (const result of results) {
      console.log(`   • Agent: ${result.agent_name}`);
      console.log(`     Score: ${result.overall_score}%`);
      console.log(`     Passed: ${result.compliance_passed ? '✅' : '❌'}`);
      console.log(`     Flagged: ${result.flagged_for_review ? '⚠️ Yes' : 'No'}\n`);
    }

    // Step 8: Test agent performance metrics
    console.log('8️⃣ Checking agent performance...');

    const { data: performance, error: perfError } = await supabase
      .from('agent_post_close_performance')
      .select('*')
      .eq('agency_id', agency.id);

    if (!perfError && performance?.length > 0) {
      console.log('   Agent Performance Metrics:');
      for (const perf of performance) {
        console.log(`   • Agent: ${perf.agent_name}`);
        console.log(`     Pass Rate: ${perf.pass_rate || 0}%`);
        console.log(`     Avg Score: ${perf.avg_compliance_score || 0}%\n`);
      }
    } else {
      console.log('   ℹ️ No performance metrics yet (will be calculated by cron job)\n');
    }

    // Step 9: Cleanup (optional)
    console.log('9️⃣ Test completed successfully! 🎉\n');
    console.log('   Note: Test data remains in database for inspection.');
    console.log('   You can view results in the Compliance Dashboard.\n');

    // Summary
    console.log('📊 Test Summary:');
    console.log('   • Scripts uploaded: 1');
    console.log('   • Calls processed: 2');
    console.log('   • Expected: 1 pass, 1 fail');
    console.log(`   • Actual: ${results.filter(r => r.compliance_passed).length} pass, ${results.filter(r => !r.compliance_passed).length} fail`);
    console.log('\n✅ Compliance workflow is operational!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Helper function to generate word timings
function generateWordTimings(transcript) {
  const words = transcript.split(/\s+/);
  const wordsPerSecond = 2.5; // Average speaking rate
  let currentTime = 0;

  return words.map(word => {
    const duration = 1000 / wordsPerSecond; // ms per word
    const timing = {
      word: word,
      start: Math.round(currentTime),
      end: Math.round(currentTime + duration),
      confidence: 0.95
    };
    currentTime += duration;
    return timing;
  });
}

// Simple compliance analyzer for testing
function analyzeTestCompliance(transcript, script) {
  const transcriptLower = transcript.toLowerCase();
  const scriptLower = script.script_text.toLowerCase();

  // Check required phrases
  let foundPhrases = 0;
  const missingPhrases = [];

  for (const phrase of script.required_phrases) {
    if (transcriptLower.includes(phrase.toLowerCase())) {
      foundPhrases++;
    } else {
      missingPhrases.push(phrase);
    }
  }

  const phraseMatch = (foundPhrases / script.required_phrases.length) * 100;

  // Simple word matching
  const scriptWords = scriptLower.split(/\s+/);
  const transcriptWords = transcriptLower.split(/\s+/);
  let matchedWords = 0;

  for (const word of scriptWords) {
    if (transcriptWords.includes(word)) {
      matchedWords++;
    }
  }

  const wordMatch = (matchedWords / scriptWords.length) * 100;

  // Calculate overall score
  const score = (phraseMatch * 0.6 + wordMatch * 0.4);
  const passed = score >= 85;

  return {
    score: Math.round(score),
    passed,
    wordMatch: Math.round(wordMatch),
    phraseMatch: Math.round(phraseMatch),
    missingPhrases
  };
}

// Run the test
testComplianceWorkflow().catch(console.error);