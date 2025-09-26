// src/lib/asr-nova2.ts
import { createClient } from "@deepgram/sdk";

export type Segment = {
  speaker: "agent" | "customer";
  startMs: number;
  endMs: number;
  text: string;
  conf: number;
};

export type Entity = {
  label: string;
  value: string;
  startMs: number;
  endMs: number;
  speaker?: "agent" | "customer" | null;
};

export type KeyPhrase = {
  phrase: string;
  type: "objection" | "rebuttal" | "closing" | "compliance" | "payment" | "other";
  category: string;
  timestamp: number;
  speaker: "agent" | "customer";
  confidence: number;
};

export type EnrichedTranscript = {
  segments: Segment[];
  asrQuality: "poor" | "fair" | "good" | "excellent";
  keyPhrases: KeyPhrase[];
  entities?: Entity[];
  conversationMetrics: {
    totalDuration: number;
    agentTalkTime: number;
    customerTalkTime: number;
    silenceTime: number;
    interruptionCount: number;
    overlappingTalkTime: number;
    longestMonologue: number;
    avgResponseLatency: number;
    agentTalkRatio: number;
  };
  salesMetrics: {
    rapportDuration: number;
    searchOccurred: boolean;
    holdDuration: number;
    cardRequested: boolean;
    cardProvided: boolean;
    cardComplete: boolean;
    routingProvided: boolean;
    objectionCount: number;
    rebuttalCount: number;
  };
};

const dg = createClient(process.env.DEEPGRAM_API_KEY!);

// Price correction mappings
const PRICE_CORRECTIONS: Record<string, string> = {
  "$1.25": "$125",
  "$1.50": "$150",
  "$1.75": "$175",
  "$2.00": "$200",
  "$2.25": "$225",
  "$2.50": "$250",
  "$2.75": "$275",
  "$3.00": "$300",
  "$3.25": "$325",
  "$3.50": "$350",
  "$3.75": "$375",
  "$4.00": "$400",
  "$4.25": "$425",
  "$4.50": "$450",
  "$4.75": "$475",
  "$5.00": "$500"
};

export type AsrOverrides = {
  model?: string;
  utt_split?: number;
  diarize?: boolean;
  utterances?: boolean;
  smart_format?: boolean;
  punctuate?: boolean;
  numerals?: boolean;
  paragraphs?: boolean;
  detect_entities?: boolean;
  keywords?: Array<[string, number]>;
};

export async function transcribeFromUrl(mp3Url: string, overrides?: AsrOverrides): Promise<EnrichedTranscript> {
  console.log('Starting transcription for URL:', mp3Url);
  if (overrides) {
    console.log('ASR overrides provided:', overrides);
  }

  // Define search terms array - REDUCED TO 20 CRITICAL TERMS FOR SPEED
  const searchTerms = [
    // Payment essentials (8)
    "visa or mastercard",
    "routing number",
    "CVV",
    "name on the card",
    "payment went through",
    "declined",
    "here's my card",
    "let me get my card",

    // Key objections (7)
    "call me back",
    "talk to my husband",
    "talk to my wife",
    "do not call",
    "already have insurance",
    "not interested",
    "can't afford",

    // Success indicators (5)
    "congratulations",
    "you're all set",
    "per month",
    "monthly",
    "enrollment complete"
  ];

  console.log('SEARCH TERMS COUNT:', searchTerms.length);

  // Convert keywords from overrides format [["term", weight]] to Deepgram format ["term:weight"]
  const keywordsFromOverrides = overrides?.keywords?.map(([term, weight]) => `${term}:${weight}`) || [];

  const options = {
    model: overrides?.model || "nova-2-phonecall",

      // ESSENTIAL - Cannot remove
      diarize: overrides?.diarize !== undefined ? overrides.diarize : true,
      utterances: overrides?.utterances !== undefined ? overrides.utterances : true,
      utt_split: overrides?.utt_split !== undefined ? overrides.utt_split : 1.1,

      // FREE formatting
      smart_format: overrides?.smart_format !== undefined ? overrides.smart_format : true,
      punctuate: overrides?.punctuate !== undefined ? overrides.punctuate : true,
      numerals: overrides?.numerals !== undefined ? overrides.numerals : true,
      paragraphs: overrides?.paragraphs !== undefined ? overrides.paragraphs : true,

      // Entity detection
      detect_entities: overrides?.detect_entities !== undefined ? overrides.detect_entities : true,

      // NO SENTIMENT
      // sentiment: false,

      // COMPREHENSIVE SEARCH PATTERNS (using searchTerms variable)
      search: searchTerms,

      // KEYWORDS - use overrides if provided, otherwise use defaults
      keywords: keywordsFromOverrides.length > 0 ? keywordsFromOverrides : [
        "PPO:1.5",
        "HMO:1.5",
        "copay:1.5",
        "deductible:1.5"
      ],

      // Remove filler words to save tokens
      filler_words: false
  };

  console.log('=== CALLING DEEPGRAM ===');
  console.log('URL:', mp3Url);
  console.log('Search terms:', searchTerms.length);
  console.log('Features enabled:', {
    smart_format: true,
    diarize: true,
    utterances: true,
    utt_split: 1.1,
    detect_entities: true,
    punctuate: true,
    numerals: true,
    paragraphs: true
  });

  let resp;
  let lastError;

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Attempt ${attempt}/3 - Calling Deepgram...`);
      const startTime = Date.now();

      resp = await dg.listen.prerecorded.transcribeUrl(
        { url: mp3Url },
        options
      );

      console.log(`Deepgram responded in ${Date.now() - startTime}ms`);

      // Comprehensive debugging of Deepgram response
      console.log('=== DEEPGRAM RESPONSE STRUCTURE ===');
      console.log('Full response keys:', Object.keys(resp || {}));
      console.log('resp.result keys:', Object.keys(resp?.result || {}));
      console.log('resp.result.results keys:', Object.keys(resp?.result?.results || {}));

      // Check what we're getting
      const debugResults = resp?.result?.results;
      console.log('Has utterances?:', !!debugResults?.utterances);
      console.log('Utterances length:', debugResults?.utterances?.length || 0);
      console.log('Has channels?:', !!debugResults?.channels);
      console.log('Channels length:', debugResults?.channels?.length || 0);

      // Check for entities
      const entities = debugResults?.channels?.[0]?.alternatives?.[0]?.entities;
      console.log('Has entities?:', !!entities);
      console.log('Entities length:', entities?.length || 0);
      if (entities && entities.length > 0) {
        console.log('First 3 entities:', entities.slice(0, 3));
      }

      // If no utterances but has channels, show what's in channels
      if (!debugResults?.utterances?.length && debugResults?.channels?.length) {
        console.log('⚠️ No utterances but has channels!');
        console.log('Channel 0 keys:', Object.keys(debugResults.channels[0] || {}));
        console.log('Has alternatives?:', !!debugResults.channels[0]?.alternatives);
        console.log('Transcript exists?:', !!debugResults.channels[0]?.alternatives?.[0]?.transcript);
        console.log('Transcript preview:', debugResults.channels[0]?.alternatives?.[0]?.transcript?.substring(0, 200));

        // Check if diarization failed
        if (debugResults.channels[0]?.alternatives?.[0]?.transcript) {
          console.log('DIARIZATION LIKELY FAILED - We have transcript but no speaker separation');
        }
      }

      // Show first few utterances if they exist
      if (debugResults?.utterances && debugResults.utterances.length > 0) {
        console.log('First 3 utterances:');
        debugResults.utterances.slice(0, 3).forEach((utt: any, i: number) => {
          console.log(`  [${i}] Speaker: ${utt.speaker}, Start: ${utt.start}s, Text: "${utt.transcript?.substring(0, 100)}..."`);
        });
      }

      // Show search results
      if ((debugResults as any)?.search?.length > 0) {
        console.log('Search results found:', (debugResults as any).search.length, 'queries matched');
        console.log('First 3 search matches:', (debugResults as any).search.slice(0, 3).map((s: any) => ({
          query: s.query,
          hits: s.hits?.length || 0
        })));
      }

      // Show current options being used
      console.log('Options sent to Deepgram:', JSON.stringify(options, null, 2));
      console.log('===================================');

      break; // Success, exit retry loop

    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt < 3) {
        const delay = attempt * 2000; // 2s, 4s
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  if (!resp && lastError) {
    console.error('All Deepgram attempts failed:', lastError);
    if (lastError instanceof Error) {
      console.error('Error details:', {
        message: lastError.message,
        name: lastError.name,
        stack: lastError.stack?.split('\n')[0]
      });
    }
    throw lastError;
  }

  console.log('=== DEEPGRAM RESPONSE ===');
  console.log('Response received:', !!resp);
  console.log('Response structure:', {
    hasResult: !!resp?.result,
    hasResults: !!resp?.result?.results,
    hasUtterances: !!resp?.result?.results?.utterances,
    utteranceCount: resp?.result?.results?.utterances?.length || 0,
    hasChannels: !!resp?.result?.results?.channels,
    channelCount: resp?.result?.results?.channels?.length || 0,
    error: resp?.error || null
  });

  // Check both utterances AND alternatives
  const channels = resp?.result?.results?.channels || [];
  const alts = channels[0]?.alternatives || [];

  console.log('Channels found:', channels.length);
  console.log('Alternatives in channel 0:', alts.length);

  if (resp?.result?.results?.utterances?.length === 0 && alts.length > 0) {
    console.error('NO UTTERANCES BUT HAS ALTERNATIVES - Possible diarization failure');
    console.log('First alternative transcript:', alts[0]?.transcript?.substring(0, 500));
  }

  // Check for error in response
  if (resp?.error || !resp?.result) {
    console.error('Deepgram returned error or no result:', resp);
    throw new Error(`Deepgram error: ${resp?.error || 'No result returned'}`);
  }

  const results = resp?.result?.results;
  const uts = results?.utterances ?? [];

  console.log('=== SEGMENT CONVERSION ===');
  console.log('Utterances to process:', uts.length);

  if (!uts.length) {
    console.error('NO UTTERANCES FOUND IN DEEPGRAM RESPONSE');
    console.log('Full response structure:', JSON.stringify(resp?.result?.results, null, 2).substring(0, 1000));
  }

  // Process segments with price fixing
  const segments: Segment[] = uts.map((u: any, idx: number, all: any[]) => {
    const prevUtt = idx > 0 ? all[idx - 1] : null;

    let text = String(u.transcript || "");

    // === FIX PRICE FORMATTING ===
    // Fix "$2.50 per month" → "$250 per month"
    if (text.match(/\$\d\.\d{2}\s*(per|a|\/)\s*month/i)) {
      text = text.replace(/\$(\d)\.(\d{2})\s*(per|a|\/)\s*month/gi,
        (match, dollars, cents) => `$${dollars}${cents} per month`);
    }

    // Fix common price shortcuts
    Object.entries(PRICE_CORRECTIONS).forEach(([wrong, right]) => {
      const regex = new RegExp(wrong.replace('$', '\\$'), 'g');
      text = text.replace(regex, right);
    });

    // Fix card/routing numbers with decimals
    if (prevUtt && prevUtt.transcript.match(/card|routing|account|CVV/i)) {
      // Remove decimals from number sequences
      text = text.replace(/\b(\d)\.(\d+)\b/g, "$1$2");
    }

    // Redact any 7+ digit numbers (except phone)
    text = text.replace(/\b\d{7,}\b/g, (match) => {
      // Keep if it looks like a phone number
      if (match.length === 10 || match.length === 11) {
        return match;
      }
      return "#######";
    });

    return {
      speaker: u.speaker === 0 ? "agent" : "customer",
      startMs: Math.round(u.start * 1000),
      endMs: Math.round(u.end * 1000),
      text: text,
      conf: Number(u.confidence ?? 0.9)
    };
  });

  console.log('Segments created:', segments.length);
  if (segments.length === 0) {
    console.error('NO SEGMENTS CREATED FROM UTTERANCES');
  } else {
    console.log('First 3 segments:', segments.slice(0, 3).map(s => ({
      speaker: s.speaker,
      text: s.text.substring(0, 100)
    })));
  }

  // Process entities if available
  let processedEntities: Entity[] = [];
  const entitiesRaw = channels[0]?.alternatives?.[0]?.entities;

  if (entitiesRaw && Array.isArray(entitiesRaw)) {
    console.log('Processing entities:', entitiesRaw.length);

    processedEntities = entitiesRaw.map((entity: any) => {
      // Calculate timestamps from character offsets if available
      const words = channels[0]?.alternatives?.[0]?.words || [];
      let startMs = 0;
      let endMs = 0;
      let speaker: "agent" | "customer" | null = null;

      // Try to find the word that contains this entity based on character offsets
      if (entity.start_word !== undefined && entity.end_word !== undefined && words.length > 0) {
        const startWord = words[entity.start_word];
        const endWord = words[entity.end_word];

        if (startWord && endWord) {
          startMs = Math.round(startWord.start * 1000);
          endMs = Math.round(endWord.end * 1000);

          // Find which utterance this falls into to determine speaker
          const utt = uts.find((u: any) =>
            startWord.start >= u.start && startWord.start <= u.end
          );
          if (utt) {
            speaker = utt.speaker === 0 ? "agent" : "customer";
          }
        }
      }

      return {
        label: entity.label || entity.type || "unknown",
        value: entity.value || entity.text || "",
        startMs,
        endMs,
        speaker
      };
    });

    console.log('Entities processed:', processedEntities.length);
    if (processedEntities.length > 0) {
      console.log('First 3 processed entities:', processedEntities.slice(0, 3));
    }
  }

  // Process search results into key phrases
  const searchResults = (results as any)?.search || [];
  const keyPhrases: KeyPhrase[] = searchResults.flatMap((searchItem: any) =>
    (searchItem.hits || [])
      .filter((hit: any) => hit.confidence > 0.6)
      .map((hit: any) => {
        const query = searchItem.query?.toLowerCase() || "";

        // Categorize the phrase
        let type: KeyPhrase["type"] = "other";
        let category = "general";

        // Opening objections
        if (query.includes("tenth person") || query.includes("never looking") ||
            query.includes("weeks ago") || query.includes("just looking")) {
          type = "objection";
          category = "opening";
        }
        // Closing objections
        else if (query.includes("talk to my") || query.includes("send me") ||
                 query.includes("too good") || query.includes("call me back")) {
          type = "objection";
          category = "closing";
        }
        // Rebuttals
        else if (query.includes("enrollment center") || query.includes("group health") ||
                 query.includes("save you") || query.includes("no deductible")) {
          type = "rebuttal";
          category = "response";
        }
        // Payment
        else if (query.includes("visa") || query.includes("mastercard") ||
                 query.includes("routing") || query.includes("CVV")) {
          type = "payment";
          category = "capture";
        }
        // Closing attempts
        else if (query.includes("congratulations") || query.includes("middle initial")) {
          type = "closing";
          category = "assumptive";
        }
        // Compliance
        else if (query.includes("do not call") || query.includes("recording")) {
          type = "compliance";
          category = "critical";
        }

        // Find speaker
        const hitTime = hit.start;
        const speakerUtt = uts.find((u: any) =>
          hitTime >= u.start && hitTime <= u.end
        );
        const speaker = speakerUtt?.speaker === 0 ? "agent" : "customer";

        return {
          phrase: searchItem.query,
          type,
          category,
          timestamp: hit.start * 1000,
          speaker,
          confidence: hit.confidence
        };
      })
  );

  // Calculate conversation metrics
  const totalDuration = segments.length > 0
    ? segments[segments.length - 1].endMs
    : 0;

  const agentSegments = segments.filter(s => s.speaker === "agent");
  const customerSegments = segments.filter(s => s.speaker === "customer");

  const agentTalkTime = agentSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  const customerTalkTime = customerSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);

  // Calculate overlapping talk
  let overlappingTalkTime = 0;
  let interruptionCount = 0;

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].speaker !== segments[i-1].speaker) {
      const overlap = segments[i-1].endMs - segments[i].startMs;
      if (overlap > 50) {
        overlappingTalkTime += overlap;
        interruptionCount++;
      }
    }
  }

  // Response latency
  const responseLatencies: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].speaker !== segments[i-1].speaker) {
      const gap = segments[i].startMs - segments[i-1].endMs;
      if (gap > 0 && gap < 5000) {
        responseLatencies.push(gap);
      }
    }
  }

  const avgResponseLatency = responseLatencies.length > 0
    ? responseLatencies.reduce((a, b) => a + b, 0) / responseLatencies.length
    : 0;

  const longestMonologue = Math.max(
    ...segments.map(s => s.endMs - s.startMs),
    0
  );

  const silenceTime = Math.max(0, totalDuration - agentTalkTime - customerTalkTime);
  const agentTalkRatio = totalDuration > 0 ? agentTalkTime / totalDuration : 0;

  // Calculate sales metrics
  const salesMetrics = calculateSalesMetrics(keyPhrases, segments);

  // ASR quality
  const avg = segments.length ? segments.reduce((a, s) => a + s.conf, 0) / segments.length : 0;
  const asrQuality = avg >= 0.92 ? "excellent" : avg >= 0.86 ? "good" : avg >= 0.78 ? "fair" : "poor";

  console.log('=== FINAL RETURN ===');
  console.log('Returning segments:', segments.length);
  console.log('ASR quality:', asrQuality);
  console.log('Key phrases found:', keyPhrases.length);
  console.log('Entities found:', processedEntities.length);

  return {
    segments,
    asrQuality,
    keyPhrases,
    entities: processedEntities.length > 0 ? processedEntities : undefined,
    conversationMetrics: {
      totalDuration,
      agentTalkTime,
      customerTalkTime,
      silenceTime,
      interruptionCount,
      overlappingTalkTime,
      longestMonologue,
      avgResponseLatency,
      agentTalkRatio
    },
    salesMetrics
  };
}

function calculateSalesMetrics(keyPhrases: KeyPhrase[], segments: Segment[]): EnrichedTranscript["salesMetrics"] {
  const metrics = {
    rapportDuration: 0,
    searchOccurred: false,
    holdDuration: 0,
    cardRequested: false,
    cardProvided: false,
    cardComplete: false,
    routingProvided: false,
    objectionCount: 0,
    rebuttalCount: 0
  };

  // Find plan search
  const searchPhrases = keyPhrases.filter(kp =>
    kp.phrase.includes("let me look") ||
    kp.phrase.includes("hold on") ||
    kp.phrase.includes("one moment")
  );

  if (searchPhrases.length > 0) {
    metrics.searchOccurred = true;
    const searchTime = searchPhrases[0].timestamp;
    metrics.rapportDuration = searchTime;

    // Find next speech after hold
    const nextSegment = segments.find(s => s.startMs > searchTime + 1000);
    if (nextSegment) {
      metrics.holdDuration = nextSegment.startMs - searchTime;
    }
  }

  // Payment capture
  metrics.cardRequested = keyPhrases.some(kp =>
    kp.phrase.includes("visa or mastercard") ||
    kp.phrase.includes("credit or debit")
  );

  // Check if numbers were read
  const numberPhrases = keyPhrases.filter(kp =>
    ["four", "five", "six", "seven", "eight", "nine"].some(num =>
      kp.phrase === num
    )
  );

  // Card complete if 4+ number groups within 30 seconds
  if (numberPhrases.length >= 4) {
    const timeDiff = numberPhrases[3].timestamp - numberPhrases[0].timestamp;
    metrics.cardComplete = timeDiff < 30000;
    metrics.cardProvided = true;
  }

  metrics.routingProvided = keyPhrases.some(kp =>
    kp.phrase.includes("routing number")
  );

  // Count objections and rebuttals
  metrics.objectionCount = keyPhrases.filter(kp => kp.type === "objection").length;
  metrics.rebuttalCount = keyPhrases.filter(kp => kp.type === "rebuttal").length;

  return metrics;
}

// Wrapper function for simple-analysis.ts compatibility
export async function transcribeBulk(audioUrl: string, overrides?: AsrOverrides) {
  const enriched = await transcribeFromUrl(audioUrl, overrides);

  // Return simplified format for simple-analysis
  return {
    segments: enriched.segments,
    entities: enriched.entities || [],
    formatted: enriched.segments.map(s =>
      `Speaker ${s.speaker === 'agent' ? 0 : 1}: ${s.text}`
    ).join('\n\n'),
    summary: null, // Summary is not available in keyPhrases
    duration: enriched.conversationMetrics?.totalDuration || 0,
    requestId: null // We don't have this in the new format
  };
}