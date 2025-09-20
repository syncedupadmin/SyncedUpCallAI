import { OPENING_OBJECTION_FAMILIES, MONEY_OBJECTION_FAMILIES, PITCH_STARTED_MARKERS, CARD_ASK } from "@/domain/playbook";

export type Segment = { speaker: "agent"|"customer"; text: string; startMs: number; endMs?: number };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const containsAny = (s: string, terms: string[]) => terms.some(t => s.includes(t));
const MMSS = (ms: number) => {
  const sec = Math.round(ms/1000);
  return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
};

type FamKeyOpening = keyof typeof OPENING_OBJECTION_FAMILIES;
type FamKeyMoney   = keyof typeof MONEY_OBJECTION_FAMILIES;

export type RebuttalUsed = { ts: string; type: string; quote: string };
export type RebuttalMissed = { ts: string; type: string; stall_quote: string };

function matchFamily(
  customerText: string,
  fam: { customer: readonly string[]; agent: readonly string[] },
  agentSegsInWindow: Segment[],
  originalSegs: Segment[]
): RebuttalUsed | RebuttalMissed | null {
  if (!containsAny(customerText, [...fam.customer])) return null;

  // Look up to 30s for agent hitting >=2 agent tokens
  let used: RebuttalUsed | null = null;
  for (const a of agentSegsInWindow) {
    const hits = fam.agent.reduce((n, t) => n + (a.text.includes(t) ? 1 : 0), 0);
    if (hits >= 2) {
      used = { ts: MMSS(a.startMs), type: "", quote: (originalSegs.find(s => s.startMs === a.startMs)?.text ?? "") };
      break;
    }
  }
  if (used) return used;
  // else missed
  return { ts: MMSS(agentSegsInWindow.length ? agentSegsInWindow[0].startMs : 0), type: "", stall_quote: "" };
}

export function detectRebuttalsV3(allSegments: Segment[]) {
  const segs = allSegments.map(s => ({ ...s, text: norm(s.text) }));
  const openingWindowMs = 30_000;

  const pitchStartMs = (() => {
    const hit = segs.find(s => s.speaker === "agent" && containsAny(s.text, [...PITCH_STARTED_MARKERS]));
    return hit ? hit.startMs : 25_000; // default: around 25s into call if not explicit
  })();

  const openingUsed: RebuttalUsed[] = [];
  const openingMissed: RebuttalMissed[] = [];
  const moneyUsed: RebuttalUsed[] = [];
  const moneyMissed: RebuttalMissed[] = [];

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.speaker !== "customer") continue;

    const windowEnd = s.startMs + 30_000;
    const agentNext30 = segs.filter(a => a.speaker === "agent" && a.startMs > s.startMs && a.startMs <= windowEnd);

    if (s.startMs <= openingWindowMs) {
      // Opening families
      for (const k of Object.keys(OPENING_OBJECTION_FAMILIES) as FamKeyOpening[]) {
        const fam = OPENING_OBJECTION_FAMILIES[k];
        if (!containsAny(s.text, [...fam.customer])) continue;
        // evaluate
        const res = matchFamily(s.text, fam, agentNext30, allSegments);
        if (res) {
          if ("quote" in res) { res.type = k; openingUsed.push(res); }
          else { res.type = k; res.stall_quote = allSegments[i].text; openingMissed.push(res); }
          break; // one match per customer turn
        }
      }
    } else if (s.startMs >= pitchStartMs) {
      // Money/close families
      for (const k of Object.keys(MONEY_OBJECTION_FAMILIES) as FamKeyMoney[]) {
        const fam = MONEY_OBJECTION_FAMILIES[k];
        if (!containsAny(s.text, [...fam.customer])) continue;
        const res = matchFamily(s.text, fam, agentNext30, allSegments);
        if (res) {
          if ("quote" in res) { res.type = k; moneyUsed.push(res); }
          else { res.type = k; res.stall_quote = allSegments[i].text; moneyMissed.push(res); }
          break;
        }
      }
    }
  }

  // Did the agent ask for the card after the last used rebuttal (either bucket)?
  const lastUsedMs = Math.max(
    ...(openingUsed.map(u => allSegments.find(x => MMSS(x.startMs) === u.ts)?.startMs || 0)),
    ...(moneyUsed.map(u => allSegments.find(x => MMSS(x.startMs) === u.ts)?.startMs || 0)),
    0
  );
  const askedForCardAfterLast = segs.some(s => s.speaker === "agent" && s.startMs > lastUsedMs && CARD_ASK.some(k => s.text.includes(k)));

  return {
    opening: {
      used: openingUsed,
      missed: openingMissed,
      counts: {
        used: openingUsed.length,
        missed: openingMissed.length
      }
    },
    money: {
      used: moneyUsed,
      missed: moneyMissed,
      counts: {
        used: moneyUsed.length,
        missed: moneyMissed.length,
        asked_for_card_after_last_rebuttal: askedForCardAfterLast
      }
    }
  };
}
