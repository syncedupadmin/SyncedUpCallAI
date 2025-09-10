export interface ASRResult {
  engine: string;
  lang: string;
  text: string;
  translated_text?: string;
  diarized?: any;
  words?: any;
}

export async function transcribeDeepgram(recordingUrl: string): Promise<ASRResult> {
  const resp = await fetch('https://api.deepgram.com/v1/listen?' + new URLSearchParams({
    punctuate: 'true',
    diarize: 'true',
    utterances: 'true',
    detect_language: 'true',
    paragraphs: 'true',
    smart_format: 'true',
    model: 'nova-2'
  }), {
    method: 'POST',
    headers: { 
      'Authorization': `Token ${process.env.DEEPGRAM_API_KEY!}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ url: recordingUrl })
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Deepgram failed: ${resp.status} - ${error}`);
  }

  const data = await resp.json();
  
  const channel = data.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  
  if (!alternative) {
    throw new Error('No transcription available from Deepgram');
  }

  const text = alternative.transcript || '';
  const lang = channel?.detected_language || 'en';
  const confidence = alternative.confidence || 0;
  
  // Extract diarized utterances if available
  const diarized = data.results?.utterances || alternative.paragraphs?.paragraphs || [];
  
  // Get word-level timestamps if available
  const words = alternative.words || [];

  // Check if translation is needed (non-English)
  let translated_text = text;
  if (lang !== 'en' && lang !== 'en-US' && lang !== 'en-GB') {
    // Deepgram doesn't provide direct translation, will handle in LLM layer
    translated_text = undefined;
  }

  return {
    engine: 'deepgram',
    lang: lang.split('-')[0], // Normalize to 2-letter code
    text,
    translated_text,
    diarized,
    words
  };
}