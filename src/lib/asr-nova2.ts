// src/lib/asr-nova2.ts
import { createClient } from "@deepgram/sdk";

export type Segment = {
  speaker: "agent" | "customer";
  startMs: number;
  endMs: number;
  text: string;
  conf: number;
};

const dg = createClient(process.env.DEEPGRAM_API_KEY!);

export async function transcribeFromUrl(mp3Url: string): Promise<{
  segments: Segment[];
  asrQuality: "poor" | "fair" | "good" | "excellent";
}> {
  const resp = await dg.listen.prerecorded.transcribeUrl(
    { url: mp3Url },
    {
      model: "nova-2-phonecall",
      diarize: true,
      utterances: true,
      smart_format: true,
      punctuate: true,
      numerals: true
    }
  );

  const uts = resp?.results?.utterances ?? [];
  const segments: Segment[] = uts.map((u: any) => ({
    speaker: (String(u.speaker) === "0" ? "agent" : "customer") as "agent" | "customer",
    startMs: Math.round(u.start * 1000),
    endMs: Math.round(u.end * 1000),
    text: String(u.transcript || "").replace(/\d{7,}/g, "#######"),
    conf: Number(u.confidence ?? 0.9)
  }));

  const avg = segments.length ? segments.reduce((a, s) => a + s.conf, 0) / segments.length : 0;
  const asrQuality = avg >= 0.92 ? "excellent" : avg >= 0.86 ? "good" : avg >= 0.78 ? "fair" : "poor";
  return { segments, asrQuality };
}