import { transcribeDeepgram, ASRResult } from './deepgram';
import { transcribeAssemblyAI } from './assemblyai';
import { withRetry } from '../lib/retry';

const ASR_PRIMARY = process.env.ASR_PRIMARY || 'deepgram';
const ASR_FALLBACK = process.env.ASR_FALLBACK || 'assemblyai';

export async function transcribe(recordingUrl: string): Promise<ASRResult> {
  // Try primary ASR provider with retry
  try {
    if (ASR_PRIMARY === 'deepgram' && process.env.DEEPGRAM_API_KEY) {
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
    } else if (ASR_PRIMARY === 'assemblyai' && process.env.ASSEMBLYAI_API_KEY) {
      return await withRetry(
        () => transcribeAssemblyAI(recordingUrl),
        {
          maxAttempts: 2,
          delayMs: 10000,
          onError: (err, attempt) => {
            console.error(`AssemblyAI attempt ${attempt} failed:`, err.message);
          }
        }
      );
    }
  } catch (primaryError) {
    console.error(`Primary ASR (${ASR_PRIMARY}) failed after retries:`, primaryError);
    
    // Try fallback provider with retry
    try {
      if (ASR_FALLBACK === 'assemblyai' && process.env.ASSEMBLYAI_API_KEY) {
        return await withRetry(
          () => transcribeAssemblyAI(recordingUrl),
          {
            maxAttempts: 2,
            delayMs: 10000,
            onError: (err, attempt) => {
              console.error(`AssemblyAI fallback attempt ${attempt} failed:`, err.message);
            }
          }
        );
      } else if (ASR_FALLBACK === 'deepgram' && process.env.DEEPGRAM_API_KEY) {
        return await withRetry(
          () => transcribeDeepgram(recordingUrl),
          {
            maxAttempts: 2,
            delayMs: 10000,
            onError: (err, attempt) => {
              console.error(`Deepgram fallback attempt ${attempt} failed:`, err.message);
            }
          }
        );
      }
    } catch (fallbackError) {
      console.error(`Fallback ASR (${ASR_FALLBACK}) failed after retries:`, fallbackError);
      throw fallbackError;
    }
  }

  throw new Error('No ASR provider available or configured');
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