'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULTS, Settings, SettingsSchema } from '@/config/asr-analysis';

type SettingsFormProps = {
  value: Settings;
  onChange(next: Settings): void;
  disabled?: boolean;
  onReset(): void;
  onCopyLink(): void;
  errors?: Record<string, string>;
};

function SettingsForm(props: SettingsFormProps) {
  const { value, onChange, disabled = false, onReset, onCopyLink, errors = {} } = props;

  const updateAsr = <K extends keyof Settings['asr']>(key: K, val: Settings['asr'][K]) => {
    onChange({ ...value, asr: { ...value.asr, [key]: val } });
  };

  const updateMoney = <K extends keyof Settings['money']>(key: K, val: Settings['money'][K]) => {
    onChange({ ...value, money: { ...value.money, [key]: val } });
  };

  const updateRebuttal = <K extends keyof Settings['rebuttal']>(key: K, val: Settings['rebuttal'][K]) => {
    onChange({ ...value, rebuttal: { ...value.rebuttal, [key]: val } });
  };

  const updateInterrupt = <K extends keyof Settings['interrupt']>(key: K, val: Settings['interrupt'][K]) => {
    onChange({ ...value, interrupt: { ...value.interrupt, [key]: val } });
  };

  const addKeyword = () => {
    const newKeywords: [string, number][] = [...value.asr.keywords, ['', 2]];
    updateAsr('keywords', newKeywords);
  };

  const removeKeyword = (idx: number) => {
    const newKeywords = value.asr.keywords.filter((_, i) => i !== idx);
    updateAsr('keywords', newKeywords);
  };

  const updateKeyword = (idx: number, term: string, weight: number) => {
    const newKeywords = value.asr.keywords.map((kw, i) =>
      i === idx ? [term, weight] as [string, number] : kw
    );
    updateAsr('keywords', newKeywords);
  };

  const ErrorMessage = ({ path }: { path: string }) => {
    const err = errors[path];
    return err ? <div className="text-red-600 text-sm mt-1 font-semibold">{err}</div> : null;
  };

  const HelperText = ({ children }: { children: React.ReactNode }) => (
    <div className="text-sm text-gray-500 mt-1.5 leading-relaxed">{children}</div>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="px-4 py-2 bg-gray-500 text-white text-sm font-semibold rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={onCopyLink}
          disabled={disabled}
          className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Copy link with settings
        </button>
      </div>

      <fieldset disabled={disabled} className="border border-gray-300 rounded-lg p-4">
        <legend className="text-lg font-bold text-gray-900 px-2">🎙️ ASR Settings</legend>

        <div className="space-y-5">
          <div>
            <label htmlFor="model" className="block text-sm font-semibold text-gray-700 mb-1">
              Model
            </label>
            <select
              id="model"
              value={value.asr.model}
              onChange={(e) => updateAsr('model', e.target.value as 'nova-2-phonecall' | 'nova-2' | 'nova-3')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 bg-white"
            >
              <option value="nova-2-phonecall">nova-2-phonecall</option>
              <option value="nova-2">nova-2</option>
              <option value="nova-3">nova-3</option>
            </select>
            <HelperText>
              Pick which brain to use. <strong>Phonecall</strong> is best for calls with two people talking.
            </HelperText>
            <ErrorMessage path="asr.model" />
          </div>

          <div>
            <label htmlFor="utt_split" className="block text-sm font-semibold text-gray-700 mb-1">
              Utterance Split
            </label>
            <input
              id="utt_split"
              type="number"
              step="0.1"
              min="0.4"
              max="2.0"
              value={value.asr.utt_split}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                const clamped = Math.max(0.4, Math.min(2.0, val));
                updateAsr('utt_split', clamped);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            <HelperText>
              Lower = fewer, longer chunks. Higher = more, shorter chunks.<br />
              <strong>Example:</strong> 0.6 → big chunks, 1.6 → many little chunks.
            </HelperText>
            <ErrorMessage path="asr.utt_split" />
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Features</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'diarize' as const, label: 'Diarize', help: 'Separate speakers' },
                { key: 'utterances' as const, label: 'Utterances', help: 'Break into sentences' },
                { key: 'smart_format' as const, label: 'Smart Format', help: 'Auto-format text' },
                { key: 'punctuate' as const, label: 'Punctuate', help: 'Add commas & periods' },
                { key: 'numerals' as const, label: 'Numerals', help: 'Use numbers: 3 not three' },
                { key: 'paragraphs' as const, label: 'Paragraphs', help: 'Group into paragraphs' },
                { key: 'detect_entities' as const, label: 'Detect Entities', help: 'Find names & places' }
              ].map(({ key, label, help }) => (
                <label key={key} className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={value.asr[key]}
                    onChange={(e) => updateAsr(key, e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-700">{label}</div>
                    <div className="text-xs text-gray-500">{help}</div>
                  </div>
                </label>
              ))}
            </div>
            <HelperText>
              Turn these on/off to add features. <strong>Example:</strong> Punctuation makes text easier to read.
            </HelperText>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                Keywords
              </label>
              <button
                type="button"
                onClick={addKeyword}
                className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded hover:bg-green-600"
              >
                Add
              </button>
            </div>
            <div className="space-y-2">
              {value.asr.keywords.map((kw, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={kw[0]}
                    onChange={(e) => updateKeyword(idx, e.target.value, kw[1])}
                    placeholder="Carrier name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                  />
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={kw[1]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 2;
                      const clamped = Math.max(1, Math.min(5, val));
                      updateKeyword(idx, kw[0], clamped);
                    }}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-gray-900 text-center"
                    title="Weight 1-5"
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyword(idx)}
                    className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <HelperText>
              Add carriers or words you care about. Weight 1-5 controls importance.<br />
              <strong>Example:</strong> Kaiser:3 means pay more attention to "Kaiser".
            </HelperText>
            <ErrorMessage path="asr.keywords" />
          </div>
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="border border-gray-300 rounded-lg p-4">
        <legend className="text-lg font-bold text-gray-900 px-2">💰 Money Settings</legend>
        <div className="space-y-5">
          <div>
            <label htmlFor="premiumHundredsIfUnder" className="block text-sm font-semibold text-gray-700 mb-1">
              Premium Hundreds If Under
            </label>
            <input
              id="premiumHundredsIfUnder"
              type="number"
              min="0"
              max="200"
              value={value.money.premiumHundredsIfUnder}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                const clamped = Math.max(0, Math.min(200, val));
                updateMoney('premiumHundredsIfUnder', clamped);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            <HelperText>
              If a premium sounds too small, fix it by multiplying by 100.<br />
              <strong>Example:</strong> If under <strong>50</strong>, then $5.10 → $510.
            </HelperText>
            <ErrorMessage path="money.premiumHundredsIfUnder" />
          </div>
          <div>
            <label htmlFor="feeHundredsIfUnder" className="block text-sm font-semibold text-gray-700 mb-1">
              Fee Hundreds If Under
            </label>
            <input
              id="feeHundredsIfUnder"
              type="number"
              min="0"
              max="200"
              value={value.money.feeHundredsIfUnder}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                const clamped = Math.max(0, Math.min(200, val));
                updateMoney('feeHundredsIfUnder', clamped);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            <HelperText>
              Same idea, but for enrollment fees.<br />
              <strong>Example:</strong> If under <strong>20</strong>, then $0.99 → $99.
            </HelperText>
            <ErrorMessage path="money.feeHundredsIfUnder" />
          </div>
          <div>
            <label htmlFor="priceCarrierWindowSec" className="block text-sm font-semibold text-gray-700 mb-1">
              Price–Carrier Window (seconds)
            </label>
            <input
              id="priceCarrierWindowSec"
              type="number"
              min="0"
              max="120"
              value={Math.round(value.money.priceCarrierWindowMs / 1000)}
              onChange={(e) => {
                const sec = parseInt(e.target.value) || 0;
                const clamped = Math.max(0, Math.min(120, sec));
                updateMoney('priceCarrierWindowMs', clamped * 1000);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            <HelperText>
              How close a price must be to a carrier mention (in seconds).<br />
              <strong>Example:</strong> 15 = look within 15 seconds before/after.
            </HelperText>
            <ErrorMessage path="money.priceCarrierWindowMs" />
          </div>
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="border border-gray-300 rounded-lg p-4">
        <legend className="text-lg font-bold text-gray-900 px-2">🗣️ Rebuttal Settings</legend>
        <div>
          <label htmlFor="rebuttalWindowSec" className="block text-sm font-semibold text-gray-700 mb-1">
            Window (seconds)
          </label>
          <input
            id="rebuttalWindowSec"
            type="number"
            min="1"
            max="600"
            value={Math.round(value.rebuttal.windowMs / 1000)}
            onChange={(e) => {
              const sec = parseInt(e.target.value) || 1;
              const clamped = Math.max(1, Math.min(600, sec));
              updateRebuttal('windowMs', clamped * 1000);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
          />
          <HelperText>
            How long the system listens for a rebuttal after a customer objection.<br />
            <strong>Example:</strong> 30 = agent has 30 seconds to respond.
          </HelperText>
          <ErrorMessage path="rebuttal.windowMs" />
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="border border-gray-300 rounded-lg p-4">
        <legend className="text-lg font-bold text-gray-900 px-2">⚡ Interrupt Settings</legend>
        <div className="space-y-5">
          <div>
            <label htmlFor="maxGapMs" className="block text-sm font-semibold text-gray-700 mb-1">
              Max Gap (milliseconds)
            </label>
            <input
              id="maxGapMs"
              type="number"
              min="50"
              max="2000"
              value={value.interrupt.maxGapMs}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 50;
                const clamped = Math.max(50, Math.min(2000, val));
                updateInterrupt('maxGapMs', clamped);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            <HelperText>
              Max pause between words to count as the same speech.<br />
              <strong>Example:</strong> 300 = short breath (0.3 seconds) still counts.
            </HelperText>
            <ErrorMessage path="interrupt.maxGapMs" />
          </div>
          <div>
            <label htmlFor="prevMinDurMs" className="block text-sm font-semibold text-gray-700 mb-1">
              Previous Min Duration (milliseconds)
            </label>
            <input
              id="prevMinDurMs"
              type="number"
              min="200"
              max="5000"
              value={value.interrupt.prevMinDurMs}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 200;
                const clamped = Math.max(200, Math.min(5000, val));
                updateInterrupt('prevMinDurMs', clamped);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
            <HelperText>
              How long the other person must talk before we call it an interruption.<br />
              <strong>Example:</strong> 1500 = 1.5 seconds of talking required.
            </HelperText>
            <ErrorMessage path="interrupt.prevMinDurMs" />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

function SuperAdminTestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const [settings, setSettings] = useState<Settings>(() => JSON.parse(JSON.stringify(DEFAULTS)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const LS_KEY = 'suai.test.settings.v1';

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const parseSettingsFromURL = (params: URLSearchParams): Partial<Settings> => {
    const partial: any = { asr: {}, money: {}, rebuttal: {}, interrupt: {} };

    if (params.has('model')) partial.asr.model = params.get('model');
    if (params.has('utt_split')) partial.asr.utt_split = parseFloat(params.get('utt_split')!);
    if (params.has('diarize')) partial.asr.diarize = params.get('diarize') === '1';
    if (params.has('utterances')) partial.asr.utterances = params.get('utterances') === '1';
    if (params.has('smart_format')) partial.asr.smart_format = params.get('smart_format') === '1';
    if (params.has('punctuate')) partial.asr.punctuate = params.get('punctuate') === '1';
    if (params.has('numerals')) partial.asr.numerals = params.get('numerals') === '1';
    if (params.has('paragraphs')) partial.asr.paragraphs = params.get('paragraphs') === '1';
    if (params.has('detect_entities')) partial.asr.detect_entities = params.get('detect_entities') === '1';

    if (params.has('kw')) {
      const kwStr = params.get('kw')!;
      const keywords: [string, number][] = kwStr.split(',').map((pair) => {
        const [term, weight] = pair.split(':');
        return [decodeURIComponent(term), parseInt(weight) || 2];
      });
      partial.asr.keywords = keywords;
    }

    if (params.has('premiumHundredsIfUnder')) partial.money.premiumHundredsIfUnder = parseInt(params.get('premiumHundredsIfUnder')!);
    if (params.has('feeHundredsIfUnder')) partial.money.feeHundredsIfUnder = parseInt(params.get('feeHundredsIfUnder')!);
    if (params.has('priceCarrierWindowMs')) partial.money.priceCarrierWindowMs = parseInt(params.get('priceCarrierWindowMs')!);

    if (params.has('rebuttalWindowMs')) partial.rebuttal.windowMs = parseInt(params.get('rebuttalWindowMs')!);

    if (params.has('interruptMaxGapMs')) partial.interrupt.maxGapMs = parseInt(params.get('interruptMaxGapMs')!);
    if (params.has('interruptPrevMinDurMs')) partial.interrupt.prevMinDurMs = parseInt(params.get('interruptPrevMinDurMs')!);

    return partial;
  };

  const encodeSettingsToURL = (s: Settings): URLSearchParams => {
    const params = new URLSearchParams();

    if (s.asr.model !== DEFAULTS.asr.model) params.set('model', s.asr.model);
    if (s.asr.utt_split !== DEFAULTS.asr.utt_split) params.set('utt_split', s.asr.utt_split.toString());
    if (s.asr.diarize !== DEFAULTS.asr.diarize) params.set('diarize', s.asr.diarize ? '1' : '0');
    if (s.asr.utterances !== DEFAULTS.asr.utterances) params.set('utterances', s.asr.utterances ? '1' : '0');
    if (s.asr.smart_format !== DEFAULTS.asr.smart_format) params.set('smart_format', s.asr.smart_format ? '1' : '0');
    if (s.asr.punctuate !== DEFAULTS.asr.punctuate) params.set('punctuate', s.asr.punctuate ? '1' : '0');
    if (s.asr.numerals !== DEFAULTS.asr.numerals) params.set('numerals', s.asr.numerals ? '1' : '0');
    if (s.asr.paragraphs !== DEFAULTS.asr.paragraphs) params.set('paragraphs', s.asr.paragraphs ? '1' : '0');
    if (s.asr.detect_entities !== DEFAULTS.asr.detect_entities) params.set('detect_entities', s.asr.detect_entities ? '1' : '0');

    const kwStr = s.asr.keywords.map(([term, weight]) => `${encodeURIComponent(term)}:${weight}`).join(',');
    const defaultKwStr = DEFAULTS.asr.keywords.map(([term, weight]) => `${encodeURIComponent(term)}:${weight}`).join(',');
    if (kwStr !== defaultKwStr) params.set('kw', kwStr);

    if (s.money.premiumHundredsIfUnder !== DEFAULTS.money.premiumHundredsIfUnder) {
      params.set('premiumHundredsIfUnder', s.money.premiumHundredsIfUnder.toString());
    }
    if (s.money.feeHundredsIfUnder !== DEFAULTS.money.feeHundredsIfUnder) {
      params.set('feeHundredsIfUnder', s.money.feeHundredsIfUnder.toString());
    }
    if (s.money.priceCarrierWindowMs !== DEFAULTS.money.priceCarrierWindowMs) {
      params.set('priceCarrierWindowMs', s.money.priceCarrierWindowMs.toString());
    }

    if (s.rebuttal.windowMs !== DEFAULTS.rebuttal.windowMs) {
      params.set('rebuttalWindowMs', s.rebuttal.windowMs.toString());
    }

    if (s.interrupt.maxGapMs !== DEFAULTS.interrupt.maxGapMs) {
      params.set('interruptMaxGapMs', s.interrupt.maxGapMs.toString());
    }
    if (s.interrupt.prevMinDurMs !== DEFAULTS.interrupt.prevMinDurMs) {
      params.set('interruptPrevMinDurMs', s.interrupt.prevMinDurMs.toString());
    }

    return params;
  };

  const validateAndSetErrors = (s: Settings): boolean => {
    const result = SettingsSchema.safeParse(s);
    if (result.success) {
      setErrors({});
      return true;
    } else {
      const errorMap: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        errorMap[path] = issue.message;
      });
      setErrors(errorMap);
      return false;
    }
  };

  useEffect(() => {
    let merged: Settings = JSON.parse(JSON.stringify(DEFAULTS));

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(LS_KEY);
        if (stored) {
          const lsPartial = JSON.parse(stored);
          merged = {
            asr: { ...merged.asr, ...lsPartial.asr },
            money: { ...merged.money, ...lsPartial.money },
            rebuttal: { ...merged.rebuttal, ...lsPartial.rebuttal },
            interrupt: { ...merged.interrupt, ...lsPartial.interrupt }
          };
        }
      } catch (e) {
        console.error('Failed to parse localStorage settings:', e);
      }
    }

    const urlPartial = parseSettingsFromURL(searchParams);
    merged = {
      asr: { ...merged.asr, ...urlPartial.asr },
      money: { ...merged.money, ...urlPartial.money },
      rebuttal: { ...merged.rebuttal, ...urlPartial.rebuttal },
      interrupt: { ...merged.interrupt, ...urlPartial.interrupt }
    };

    const validationResult = SettingsSchema.safeParse(merged);
    if (validationResult.success) {
      setSettings(validationResult.data);
      setErrors({});
    } else {
      setSettings(merged as Settings);
      const errorMap: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        errorMap[path] = issue.message;
      });
      setErrors(errorMap);
    }
  }, [searchParams]);

  const handleSettingsChange = (next: Settings) => {
    setSettings(next);
    const isValid = validateAndSetErrors(next);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      if (isValid) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LS_KEY, JSON.stringify(next));
        }

        const params = encodeSettingsToURL(next);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    }, 250);
  };

  const handleReset = () => {
    setSettings(JSON.parse(JSON.stringify(DEFAULTS)));
    setErrors({});
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LS_KEY);
    }
    router.replace(window.location.pathname, { scroll: false });
  };

  const handleCopyLink = () => {
    const params = encodeSettingsToURL(settings);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    });
  };

  const analyzeCall = async () => {
    if (!url) {
      setError('Please enter a recording URL');
      return;
    }

    const isValid = validateAndSetErrors(settings);
    if (!isValid) {
      setError('Please fix settings errors before analyzing');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_url: url, settings })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to analyze (${response.status})`);
      }

      const data = await response.json();
      setResult(data);
      setCollapsed(true);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const isAnalyzeDisabled = !url || loading || Object.keys(errors).length > 0 || !SettingsSchema.safeParse(settings).success;

  const formatMoney = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatTimestamp = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // --- Time normalization helpers (ms/seconds mix safety) ---
  const TEN_DAYS_SEC = 10 * 24 * 60 * 60;

  function toSeconds(maybeSecondsOrMs: number | null | undefined): number {
    if (!maybeSecondsOrMs || maybeSecondsOrMs < 0) return 0;
    const n = Number(maybeSecondsOrMs);
    // If it's insanely large (e.g., > 10 days), it was almost certainly milliseconds.
    return n > TEN_DAYS_SEC ? Math.round(n / 1000) : Math.round(n);
  }

  function toMsFromUnknown(n: number | null | undefined, durationMsFallback?: number) {
    if (!n || n < 0) return null;
    // If n looks like seconds (small), convert to ms. If it looks like ms (big), keep it.
    if (n > TEN_DAYS_SEC) return Math.round(n); // already ms
    // if duration is known and huge, prefer seconds→ms conversion
    return Math.round(n * 1000);
  }

  // Guard against nonsense (negative, > duration, NaN)
  function clampTimestampMs(ts: number | null, durationMs: number) {
    if (ts == null || !Number.isFinite(ts)) return null;
    if (ts < 0) return null;
    if (ts > durationMs && ts > 1000) return null; // drop obviously bad points
    return ts;
  }

  return (
    <div className="p-6 max-w-full mx-auto bg-gray-50 min-h-screen">
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg mb-6">
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">SuperAdmin Testing Interface</h1>
          <p className="text-base text-gray-700 mb-4">
            Test the production analysis pipeline with any recording URL
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-base font-semibold text-gray-800 mb-1">
                Recording URL
              </label>
              <input
                id="url"
                type="url"
                placeholder="https://admin-dt.convoso.com/play-recording-public/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-base text-gray-900 bg-white placeholder-gray-400"
              />
            </div>

            {!collapsed && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h2 className="text-xl font-bold mb-4 text-gray-900">Analysis Settings</h2>
                <SettingsForm
                  value={settings}
                  onChange={handleSettingsChange}
                  disabled={loading}
                  onReset={handleReset}
                  onCopyLink={handleCopyLink}
                  errors={errors}
                />
              </div>
            )}

            <button
              onClick={analyzeCall}
              disabled={isAnalyzeDisabled}
              className="px-6 py-3 bg-blue-600 text-white text-base font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze Recording'}
            </button>

            {process.env.NODE_ENV !== 'production' && (
              <div className="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-600">
                <div>Endpoint: <span className="font-semibold">/api/analyze</span></div>
                <div>Body includes recording_url: <span className="font-semibold">true</span></div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-md">
              <p className="text-red-700 text-base font-medium">{error}</p>
            </div>
          )}
        </div>
      </div>

      {result && (() => {
        // Normalize duration and talk metrics once at the top
        const durationSec = toSeconds(result.duration) || 180;
        const durationMs = durationSec * 1000;

        // Normalize talk metrics if present
        const agentTalkSecRaw = result.talk_metrics?.talk_time_agent_sec ?? result.talk_metrics?.agent_seconds ?? result.talk_metrics?.agent ?? 0;
        const customerTalkSecRaw = result.talk_metrics?.talk_time_customer_sec ?? result.talk_metrics?.customer_seconds ?? result.talk_metrics?.customer ?? 0;
        const silenceSecRaw = result.talk_metrics?.silence_time_sec ?? result.talk_metrics?.silence_seconds ?? result.talk_metrics?.silence ?? 0;

        const agentTalkSec = Math.min(toSeconds(agentTalkSecRaw), durationSec);
        const customerTalkSec = Math.min(toSeconds(customerTalkSecRaw), durationSec);
        let silenceSec = Math.min(toSeconds(silenceSecRaw), durationSec);

        // If metrics don't sum to duration, try to balance (best-effort)
        const total = agentTalkSec + customerTalkSec + silenceSec;
        if (durationSec > 0 && (total === 0 || total > durationSec * 1.5)) {
          // Fallback: recompute silence as residual if agent+customer look sane
          const ac = agentTalkSec + customerTalkSec;
          silenceSec = ac <= durationSec ? Math.max(0, durationSec - ac) : 0;
        }

        // Create normalized talk metrics object
        const normalizedTalkMetrics = {
          talk_time_agent_sec: agentTalkSec,
          talk_time_customer_sec: customerTalkSec,
          silence_time_sec: silenceSec,
          interrupt_count: result.talk_metrics?.interrupt_count ?? 0
        };

        return (
        <div className="space-y-6">
          {/* Core Analysis Results */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">
                Core Analysis Results
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Outcome</label>
                  <div className="text-xl font-bold text-blue-600 capitalize">
                    {result.analysis?.outcome || '—'}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Monthly Premium</label>
                  <div className="text-xl font-bold text-green-600">
                    {formatMoney(result.analysis?.monthly_premium)}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Enrollment Fee</label>
                  <div className="text-xl font-bold text-green-600">
                    {formatMoney(result.analysis?.enrollment_fee)}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Reason</label>
                  <p className="text-base text-gray-800">{result.analysis?.reason || '—'}</p>
                </div>
                <div className="border-l-4 border-blue-500 pl-4">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Summary</label>
                  <p className="text-base text-gray-800">{result.analysis?.summary || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Customer & Agent Info */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Customer & Agent Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Customer Name</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.customer_name || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Agent Name</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.agent_name || result.metadata?.agent_name || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Details */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Policy Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Carrier</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.policy_details?.carrier || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Plan Type</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.policy_details?.plan_type || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Effective Date</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.policy_details?.effective_date || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mentions Table */}
          {result.mentions_table && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Extracted Mentions</h2>

                {/* Money Mentions with ASR Correction Display */}
                {result.mentions_table.money_mentions?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">Money Mentions</h3>
                    <div className="space-y-3">
                      {result.mentions_table.money_mentions.map((item: any, i: number) => {
                        const getCorrectedInfo = () => {
                          const rawStr = item.value_raw?.replace(/[$,]/g, '').trim();

                          if (item.field_hint === 'monthly_premium' && result.analysis?.monthly_premium) {
                            if (rawStr && parseFloat(rawStr) < 20 && result.analysis.monthly_premium >= 150) {
                              return { value: `$${result.analysis.monthly_premium}`, needsCorrection: true };
                            }
                            return { value: `$${result.analysis.monthly_premium}`, needsCorrection: false };
                          }

                          if (item.field_hint === 'first_month_bill' && result.analysis?.monthly_premium) {
                            const enrollment = result.analysis?.enrollment_fee || 0;
                            const premium = result.analysis?.monthly_premium || 0;
                            const total = premium + enrollment;
                            if (rawStr && parseFloat(rawStr) < 20 && total >= 175) {
                              return { value: `$${total}`, needsCorrection: true };
                            }
                            return { value: `$${total}`, needsCorrection: false };
                          }

                          if (item.field_hint === 'enrollment_fee' && result.analysis?.enrollment_fee) {
                            const rawNum = parseFloat(rawStr);
                            const finalNum = result.analysis.enrollment_fee;

                            if ((rawNum < 2 && finalNum === 99) ||
                                (rawNum < 2 && finalNum === 125) ||
                                (rawNum === 27.5 && finalNum === 27.5) ||
                                (rawNum < 10 && finalNum >= 27.5)) {
                              return { value: `$${result.analysis.enrollment_fee}`, needsCorrection: rawNum !== finalNum };
                            }
                            return { value: `$${result.analysis.enrollment_fee}`, needsCorrection: false };
                          }

                          return { value: null, needsCorrection: false };
                        };

                        const correctionInfo = getCorrectedInfo();
                        const { value: correctedValue, needsCorrection } = correctionInfo;

                        return (
                          <div key={i} className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="text-base font-semibold text-gray-700">
                                  {item.field_hint.replace(/_/g, ' ')}: {' '}
                                  <span className="text-gray-900 ml-1">
                                    {needsCorrection && correctedValue ? correctedValue : item.value_raw}
                                  </span>
                                </div>
                                <div className="text-base text-gray-700 italic mt-1">"{item.quote}"</div>
                                <div className="text-sm text-gray-600 mt-1">Speaker: {item.speaker}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Carrier Mentions */}
                {result.mentions_table.carrier_mentions?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">Carrier Mentions</h3>
                    <div className="space-y-3">
                      {result.mentions_table.carrier_mentions.map((item: any, i: number) => (
                        <div key={i} className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                          <div className="text-base font-semibold text-gray-700">{item.carrier}</div>
                          <div className="text-base text-gray-700 italic">
                            "{item.normalized_quote || item.quote}"
                          </div>
                          {item.price_normalized && (
                            <div className="text-xs text-gray-500 mt-1">
                              Original: ${item.raw_price?.toFixed(2)} → Corrected: ${item.normalized_price?.toFixed(2)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date Mentions */}
                {result.mentions_table.date_mentions?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">Date Mentions</h3>
                    <div className="space-y-3">
                      {result.mentions_table.date_mentions.map((item: any, i: number) => (
                        <div key={i} className="bg-purple-50 border border-purple-300 rounded-lg p-4">
                          <div className="text-base font-semibold text-gray-700">
                            {item.kind}: {item.value_raw}
                          </div>
                          <div className="text-base text-gray-700 italic">"{item.quote}"</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rebuttals Analysis */}
          {result.rebuttals && (() => {
            // De-duplicate: remove from "missed" any objection that has an immediate response
            const missed = result.rebuttals.missed ?? [];
            const immediate = result.rebuttals.immediate ?? [];

            // Build a quick key (type + rough time bucket) so nearby responses match
            function bucketKey(o: any) {
              const t = toMsFromUnknown(o?.timestamp_ms, durationMs) ?? 0;
              const bucket = Math.round((t / 1000) / 5); // 5s buckets
              return `${o?.kind || o?.type || o?.stall_type || 'unknown'}:${bucket}`;
            }

            const respondedBuckets = new Set(immediate.map((i: any) => bucketKey(i)));
            const missedFiltered = missed.filter((m: any) => !respondedBuckets.has(bucketKey(m)));

            return (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Objection Handling Analysis</h2>

                <div className="space-y-6">
                  {/* Addressed */}
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-green-700">
                      ✓ Addressed Objections ({result.rebuttals.used?.length || 0})
                    </h3>
                    {result.rebuttals.used?.length > 0 ? (
                      <div className="space-y-3">
                        {result.rebuttals.used.map((item: any, i: number) => (
                          <div key={i} className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                            <div className="text-base font-semibold text-gray-700 mb-2">
                              [{item.ts}] {item.stall_type}
                            </div>
                            <div className="space-y-2">
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Customer:</span> "{item.quote_customer}"
                              </div>
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Agent Response:</span> "{item.quote_agent}"
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-base text-gray-600">No addressed objections</p>
                    )}
                  </div>

                  {/* Missed */}
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-red-700">
                      ✗ Missed Objections ({missedFiltered.length})
                    </h3>
                    {missedFiltered.length > 0 ? (
                      <div className="space-y-3">
                        {missedFiltered.map((item: any, i: number) => (
                          <div key={i} className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
                            <div className="text-base font-semibold text-gray-700 mb-2">
                              [{item.ts}] {item.stall_type}
                            </div>
                            <div className="text-base text-gray-800">
                              <span className="font-semibold">Customer:</span> "{item.quote_customer}"
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-base text-gray-600">No missed objections</p>
                    )}
                  </div>

                  {/* Immediate */}
                  {result.rebuttals.immediate && result.rebuttals.immediate.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold mb-3 text-blue-700">
                        ⚡ Immediate Responses ({result.rebuttals.immediate.length})
                      </h3>
                      <div className="space-y-3">
                        {result.rebuttals.immediate.map((item: any, i: number) => (
                          <div key={i} className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
                            <div className="text-base font-semibold text-gray-700 mb-2">
                              [{item.ts}] {item.stall_type}
                            </div>
                            <div className="space-y-2">
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Customer:</span> "{item.quote_customer}"
                              </div>
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Agent (within 15s):</span>
                                "{item.quote_agent_immediate || 'No immediate response'}"
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })()}

          {/* Red Flags */}
          {result.analysis?.red_flags?.length > 0 && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">⚠️ Red Flags</h2>
                <div className="flex flex-wrap gap-3">
                  {result.analysis.red_flags.map((flag: string, i: number) => (
                    <span key={i} className="px-4 py-2 bg-red-100 text-red-800 rounded-full text-base font-semibold">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Talk Metrics - Debug */}
          {!result.talk_metrics && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
              <p className="text-yellow-800">Talk metrics not found in result</p>
            </div>
          )}

          {/* Talk Metrics */}
          {result.talk_metrics && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Talk Metrics</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {(() => {
                    const fmt = (sec: number) => {
                      if (!Number.isFinite(sec) || sec <= 0) return "0s";
                      const m = Math.floor(sec / 60);
                      const s = Math.floor(sec % 60);
                      if (m > 0) return `${m}m ${s}s`;
                      return `${s}s`;
                    };
                    const tm = normalizedTalkMetrics;
                    return (
                      <>
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Agent Talk Time</label>
                          <div className="text-xl font-bold text-blue-600">
                            {fmt(tm.talk_time_agent_sec)}
                          </div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Customer Talk Time</label>
                          <div className="text-xl font-bold text-green-600">
                            {fmt(tm.talk_time_customer_sec)}
                          </div>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Silence Time</label>
                          <div className="text-xl font-bold text-yellow-600">
                            {fmt(tm.silence_time_sec)}
                          </div>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Interruptions</label>
                          <div className="text-xl font-bold text-purple-600">
                            {tm.interrupt_count}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Talk Ratio Bar */}
                {(() => {
                  const tm = normalizedTalkMetrics;
                  const total = tm.talk_time_agent_sec + tm.talk_time_customer_sec + tm.silence_time_sec;
                  if (total > 0) {
                    const agentPct = Math.round((tm.talk_time_agent_sec / total) * 100);
                    const custPct = Math.round((tm.talk_time_customer_sec / total) * 100);
                    const silencePct = Math.round((tm.silence_time_sec / total) * 100);
                    return (
                      <div className="mt-6">
                        <label className="text-base font-semibold text-gray-700 block mb-2">Talk Distribution</label>
                        <div className="flex h-8 rounded-lg overflow-hidden">
                          {agentPct > 0 && (
                            <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-semibold"
                                 style={{width: `${agentPct}%`}}>
                              {agentPct}%
                            </div>
                          )}
                          {custPct > 0 && (
                            <div className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold"
                                 style={{width: `${custPct}%`}}>
                              {custPct}%
                            </div>
                          )}
                          {silencePct > 0 && (
                            <div className="bg-gray-400 flex items-center justify-center text-white text-xs font-semibold"
                                 style={{width: `${silencePct}%`}}>
                              {silencePct}%
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>Agent: {agentPct}%</span>
                          <span>Customer: {custPct}%</span>
                          <span>Silence: {silencePct}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

          {/* Deepgram Features - New Section */}
          {result.dg_features && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">🎙️ Deepgram Features</h2>
                <div className="flex flex-wrap gap-2">
                  {result.dg_features.map((feature: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* All Carrier Mentions with Prices - New Section */}
          {result.mentions_table?.carrier_mentions && result.mentions_table.carrier_mentions.length > 0 && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">🏢 All Carrier Mentions</h2>
                <div className="space-y-3">
                  {(() => {
                    const findNearestPrice = (carrierTs: number, moneyMentions: any[]) => {
                      const window = 15000;
                      let best = null;
                      let bestDelta = Infinity;
                      for (const m of moneyMentions || []) {
                        const mTs = m.timestamp_ms || 0;
                        const delta = Math.abs(mTs - carrierTs);
                        if (delta <= window && delta < bestDelta) {
                          best = m;
                          bestDelta = delta;
                        }
                      }
                      return best;
                    };

                    return result.mentions_table.carrier_mentions.map((mention: any, i: number) => {
                      const nearestPrice = findNearestPrice(
                        mention.timestamp_ms || 0,
                        result.mentions_table.money_mentions
                      );

                      return (
                        <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-baseline gap-3">
                                <span className="font-semibold text-gray-900 text-lg">{mention.carrier}</span>
                                {nearestPrice && (
                                  <span className="text-xl font-bold text-blue-600">
                                    ${nearestPrice.value_raw}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-600 mt-1 text-sm">"{mention.quote}"</div>
                              <div className="flex gap-2 mt-2">
                                {mention.source === 'deepgram_entity' && (
                                  <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                                    Entity Detected
                                  </span>
                                )}
                                {nearestPrice && (
                                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                    Price within 15s
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Call Timeline - Horizontal Bar with Key Moments */}
          {result.mentions_table && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">⏱️ Call Timeline</h2>
                {(() => {
                  const firstPricingTsRaw = result.mentions_table.money_mentions?.[0]?.timestamp_ms ?? null;
                  const firstPricingTs = clampTimestampMs(toMsFromUnknown(firstPricingTsRaw, durationMs), durationMs);

                  const effectiveDate = result.analysis?.policy_details?.effective_date;
                  const effectiveDateTsRaw = result.mentions_table.date_mentions?.find((d: any) =>
                    d.value_raw?.includes(effectiveDate?.split('-')[1] || '')
                  )?.timestamp_ms ?? null;
                  const effectiveDateTs = clampTimestampMs(toMsFromUnknown(effectiveDateTsRaw, durationMs), durationMs);

                  const agreedTs = result.mentions_table.signals?.sale_cues?.length > 0
                    ? (firstPricingTs ? clampTimestampMs(firstPricingTs + 30000, durationMs) : null)
                    : null;

                  const billingTs = result.transcript?.match(/#{7,}/)
                    ? (firstPricingTs ? clampTimestampMs(firstPricingTs + 60000, durationMs) : null)
                    : null;

                  const moments = [
                    { label: 'Pricing discussed', ts: firstPricingTs, icon: '💵', color: 'bg-blue-500' },
                    { label: 'Customer agreed', ts: agreedTs, icon: '✅', color: 'bg-green-500' },
                    { label: 'Billing taken', ts: billingTs, icon: '💳', color: 'bg-purple-500' },
                    { label: 'Effective date confirmed', ts: effectiveDateTs, icon: '📅', color: 'bg-orange-500' }
                  ].filter(m => m.ts !== null && m.ts > 0);

                  const timelineEvents = moments.filter(Boolean);
                  if (timelineEvents.length === 0) {
                    return <div className="text-gray-500 text-center py-8">No timeline events detected</div>;
                  }

                  return (
                    <div>
                      <div className="relative h-3 bg-gray-200 rounded-full mb-8">
                        {timelineEvents.map((moment, i) => {
                          const percent = ((moment.ts! / durationMs) * 100).toFixed(1);
                          return (
                            <div
                              key={i}
                              className={`absolute h-3 w-3 rounded-full ${moment.color} -top-0`}
                              style={{ left: `${percent}%` }}
                              title={moment.label}
                            />
                          );
                        })}
                      </div>

                      <div className="space-y-2">
                        {timelineEvents.map((moment, i) => {
                          const timeSec = Math.floor((moment.ts! / 1000));
                          const minutes = Math.floor(timeSec / 60);
                          const seconds = timeSec % 60;
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-2xl">{moment.icon}</span>
                              <div className="flex-1">
                                <span className="font-semibold text-gray-900">{moment.label}</span>
                                <span className="text-gray-500 text-sm ml-2">
                                  at {minutes}:{seconds.toString().padStart(2, '0')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Entities Debug - New Section */}
          {result.entities_summary && Object.keys(result.entities_summary).length > 0 && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">🔍 Entities Debug</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(result.entities_summary).map(([type, count]) => (
                    <div key={type} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="text-sm font-semibold text-gray-600 uppercase">{type}</div>
                      <div className="text-2xl font-bold text-gray-900">{count as number}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Analysis Metadata</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Model</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.metadata?.model || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Duration</label>
                  <div className="text-lg font-medium text-gray-800">
                    {durationSec ? `${durationSec}s` : '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Utterances</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.utterance_count || '—'}
                  </div>
                </div>
              </div>

              {result.metadata?.deepgram_request_id && (
                <div className="mt-4">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Deepgram Request ID</label>
                  <div className="text-sm font-mono text-gray-600">
                    {result.metadata.deepgram_request_id}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transcript */}
          {result.transcript && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Transcript</h2>
                <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-base text-gray-800 font-sans">
                    {result.transcript}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Raw Data */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-2 text-gray-900">Raw Response Data</h2>
              <p className="text-gray-700 text-base mb-4">Full API response for debugging</p>
              <div className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm text-green-400 font-mono">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          </div>

          {collapsed && (
            <details className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <summary className="p-6 cursor-pointer text-xl font-bold text-gray-900 hover:bg-gray-50">
                Settings (advanced)
              </summary>
              <div className="p-6 border-t border-gray-300">
                <SettingsForm
                  value={settings}
                  onChange={handleSettingsChange}
                  disabled={loading}
                  onReset={handleReset}
                  onCopyLink={handleCopyLink}
                  errors={errors}
                />
              </div>
            </details>
          )}
        </div>
        );
      })()}
    </div>
  );
}

export default function SuperAdminTestPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading...</div>}>
      <SuperAdminTestPageContent />
    </Suspense>
  );
}