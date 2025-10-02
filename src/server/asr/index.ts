import { transcribeDeepgram, ASRResult } from './deepgram';
import { withRetry } from '../lib/retry';

export async function transcribe(recordingUrl: string): Promise<ASRResult> {
  // Check if Deepgram is configured
  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is not configured');
  }

  // Try Deepgram with retry logic
  try {
    return await withRetry(
      () => transcribeDeepgram(recordingUrl),
      {
        maxAttempts: 2,
        delayMs: 10000,
        onError: (err, attempt) => {
          console.error(`Deepgram attempt ${attempt} failed:`, err.message);
        }
      }
    );
  } catch (error) {
    console.error('Deepgram failed after retries:', error);
    throw error;
  }
}

// Translate text using LLM if needed
export async function translateToEnglish(text: string, sourceLang: string): Promise<string> {
  if (sourceLang === 'en' || !text) return text;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the following text to English, preserving the original meaning and tone. Output ONLY the English translation, nothing else.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      console.error('Translation failed:', response.status);
      return text; // Return original if translation fails
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Translation error:', error);
    return text; // Return original on error
  }
}

export type { ASRResult };