// src/lib/money.ts
const WORD = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
  seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50,
  sixty:60, seventy:70, eighty:80, ninety:90, hundred:100
};

function wordsToNumber(str: string): number | null {
  // handles "two thirty two", "two hundred thirty two", "two thirty-two", "point/and eighteen"
  const cleaned = str.toLowerCase().replace(/[-,]/g,' ').replace(/\s+/g,' ').trim();
  let dollars = 0, cents = 0, seenPoint = false, buf = 0;

  const pushBuf = () => { dollars += buf; buf = 0; };

  for (const tok of cleaned.split(' ')) {
    if (tok === 'point' || tok === 'and') { seenPoint = true; continue; }
    const n = WORD[tok as keyof typeof WORD];
    if (n === undefined) { continue; }
    if (n === 100 && buf > 0) { buf *= 100; }
    else if (n >= 20 && n % 10 === 0 && buf > 0) { buf += n; } // thirty-two
    else { buf += n; }
  }
  pushBuf();

  if (seenPoint) {
    // crude grab for trailing cents words "eighteen" -> 18
    const m = cleaned.match(/(?:point|and)\s+([a-z\- ]+)/);
    if (m) {
      const c = wordsToNumber(m[1] || '');
      if (typeof c === 'number') cents = Math.min(99, c);
    }
  }
  return dollars * 100 + cents;
}

export function extractMoneyCandidates(text: string) {
  const candidates: { cents:number; ix:number; raw:string; context:string }[] = [];

  // 1) $232.18 / 232.18 / 232
  const re = /(?:\$|usd\s*)?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const dollars = parseInt(m[1].replace(/,/g,''), 10);
    const cents = m[2] ? parseInt(m[2].padEnd(2,'0'), 10) : 0;
    const total = dollars*100 + cents;
    // plausible monthly premiums live between $30 and $2000
    if (total >= 3000 && total <= 200000) {
      candidates.push({ cents: total, ix: m.index, raw: m[0], context: text.slice(Math.max(0,m.index-40), m.index+40) });
    }
  }

  // 2) "two hundred thirty two and 18"
  const wordish = /((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\- ](?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))*(?:\s+(?:and|point)\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))?)/gi;
  while ((m = wordish.exec(text)) !== null) {
    const cents = wordsToNumber(m[1]);
    if (typeof cents === 'number' && cents >= 3000 && cents <= 200000) {
      candidates.push({ cents, ix: m.index, raw: m[0], context: text.slice(Math.max(0,m.index-40), m.index+40) });
    }
  }

  // Take the last plausible amount mentioned as the premium candidate
  candidates.sort((a,b)=>a.ix-b.ix);
  return candidates;
}

export function choosePremiumAndFee(transcript: string) {
  const cands = extractMoneyCandidates(transcript);
  if (!cands.length) return { premium_cents: null, fee_cents: null, evidence: null };

  // Heuristics: last amount near "per month|monthly|premium" = premium
  // First amount near "enrollment|signup|processing|application fee" = fee
  const near = (ix:number, kw:RegExp) => kw.test(transcript.slice(Math.max(0, ix-40), ix+40).toLowerCase());

  let premium = null, fee = null, pEv=null, fEv=null;

  for (const cand of cands) {
    if (!premium && near(cand.ix, /(per\s*month|monthly|a month|premium)/i)) { premium = cand.cents; pEv=cand; }
    if (!fee && near(cand.ix, /(enrollment|sign\s*up|processing|application)\s*fee/i)) { fee = cand.cents; fEv=cand; }
  }

  // Fallback: take the last candidate as premium if none matched keywords
  if (!premium) { const last = cands[cands.length-1]; premium = last.cents; pEv = last; }

  return {
    premium_cents: premium,
    fee_cents: fee,
    evidence: {
      premium_quote: pEv?.raw || null,
      premium_context: pEv?.context || null,
      fee_quote: fEv?.raw || null,
      fee_context: fEv?.context || null
    }
  };
}