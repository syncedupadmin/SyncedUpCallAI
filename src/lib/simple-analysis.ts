import { createClient } from "@deepgram/sdk";
import OpenAI from "openai";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function analyzeCallSimple(audioUrl: string) {
  // Step 1: Get transcript from Deepgram with diarization
  console.log('Getting transcript from Deepgram...');

  const { result } = await deepgram.listen.prerecorded.transcribeUrl(
    { url: audioUrl },
    {
      model: "nova-2",
      smart_format: true,
      diarize: true,
      utterances: true,
      punctuate: true,
      paragraphs: true,
    }
  );

  // Extract utterances with speakers
  const utterances = result?.results?.utterances || [];

  // Format transcript with speakers
  const formattedTranscript = utterances.map(u =>
    `Speaker ${u.speaker}: ${u.transcript}`
  ).join('\n\n');

  console.log(`Transcript ready: ${utterances.length} utterances`);

  // Step 2: Send to OpenAI for analysis
  console.log('Analyzing with OpenAI...');

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are analyzing insurance sales calls. Based on the transcript, determine:
1. Was this a sale, no sale, or callback scheduled?
2. What was the monthly premium quoted (if any)?
3. What was the main reason for the outcome?
4. Provide a brief summary.

Return ONLY valid JSON in this format:
{
  "outcome": "sale" | "no_sale" | "callback",
  "monthly_premium": number or null,
  "enrollment_fee": number or null,
  "reason": string,
  "summary": string,
  "customer_name": string or null,
  "policy_details": {
    "carrier": string or null,
    "plan_type": string or null,
    "effective_date": string or null
  },
  "red_flags": []
}`
      },
      {
        role: "user",
        content: `Analyze this call transcript:\n\n${formattedTranscript}`
      }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  const analysis = JSON.parse(completion.choices[0].message.content || "{}");

  // Step 3: Return combined result
  return {
    transcript: formattedTranscript,
    utterance_count: utterances.length,
    duration: result?.results?.channels?.[0]?.alternatives?.[0]?.words?.slice(-1)[0]?.end || 0,
    analysis,
    metadata: {
      model: "simple-v1",
      deepgram_request_id: result?.metadata?.request_id,
      processed_at: new Date().toISOString()
    }
  };
}