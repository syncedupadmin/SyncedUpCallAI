import { ASRResult } from './deepgram';

export async function transcribeAssemblyAI(recordingUrl: string): Promise<ASRResult> {
  // Submit transcription job
  const submitResp = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { 
      'Authorization': process.env.ASSEMBLYAI_API_KEY!,
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ 
      audio_url: recordingUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
      language_detection: true,
      auto_chapters: false,
      entity_detection: false,
      iab_categories: false
    })
  });

  if (!submitResp.ok) {
    const error = await submitResp.text();
    throw new Error(`AssemblyAI submit failed: ${submitResp.status} - ${error}`);
  }

  const job = await submitResp.json();

  // Poll for completion (max 2 minutes for batch context)
  const maxAttempts = 40;
  const pollInterval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const pollResp = await fetch(`https://api.assemblyai.com/v2/transcript/${job.id}`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! }
    });

    if (!pollResp.ok) {
      throw new Error(`AssemblyAI poll failed: ${pollResp.status}`);
    }

    const result = await pollResp.json();

    if (result.status === 'completed') {
      const text = result.text || '';
      const lang = result.language_code || 'en';
      
      // Extract speaker utterances for diarization
      const diarized = result.utterances || [];
      
      // Get word-level data
      const words = result.words || [];

      // Check if translation needed
      let translated_text = text;
      if (lang !== 'en' && result.language_code) {
        // AssemblyAI doesn't provide translation, will handle in LLM
        translated_text = undefined;
      }

      return {
        engine: 'assemblyai',
        lang: lang.split('_')[0], // Normalize (en_us -> en)
        text,
        translated_text,
        diarized,
        words
      };
    }

    if (result.status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${result.error}`);
    }
  }

  throw new Error('AssemblyAI transcription timeout');
}