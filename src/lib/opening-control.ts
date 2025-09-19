// src/lib/opening-control.ts
import type { Segment } from "./asr-nova2";

export function openingAndControl(segments: Segment[]){
  const first90 = segments.filter(s => s.startMs <= 90_000);
  const agent = first90.filter(s=>s.speaker==="agent");
  const cust  = first90.filter(s=>s.speaker==="customer");

  const talkAgent = agent.reduce((a,s)=>a+(s.endMs-s.startMs),0)/1000;
  const talkCust  = cust.reduce((a,s)=>a+(s.endMs-s.startMs),0)/1000;
  const share = talkAgent / Math.max(1, talkAgent+talkCust);

  // soft cues for opening: name use, purpose, assume-the-sale language
  const txt = agent.map(s=>s.text.toLowerCase()).join(" ");
  const usedName = /\b(nick|sir|ma'?am|mr\.|ms\.)\b/i.test(txt); // or feed lead first name here
  const purpose  = /(help|get you set up|enroll|take care of this today)/i.test(txt);
  const assume   = /(today|right now|we'll get you set up)/i.test(txt);

  const checks = [usedName, purpose, assume].filter(Boolean).length;
  const opening_score = Math.round( (checks/3)*100 );

  // control: talk share in 0.55–0.70 and >2 questions/minute
  const questions = (txt.match(/\?/g)||[]).length;
  const duration = first90.length > 0 ? (first90[first90.length-1].endMs - first90[0].startMs) : 1;
  const qpm = questions / Math.max(1, duration/60000);
  let control_score = 70;
  if (share < 0.55 || share > 0.70) control_score -= 20;
  if (qpm < 2) control_score -= 10;
  control_score = Math.max(0, control_score);

  const fb: string[] = [];
  if (!usedName) fb.push("opening: didn't use name/rapport");
  if (!purpose)  fb.push("opening: purpose/benefit unclear");
  if (!assume)   fb.push("opening: no assume-the-sale language");
  if (qpm < 2)   fb.push("control: low discovery pace");
  if (share < 0.55) fb.push("control: caller dominated");
  if (share > 0.70) fb.push("control: agent monologue");

  return { opening_score, control_score, opening_feedback: fb };
}