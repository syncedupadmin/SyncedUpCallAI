"use client";
import { usePrefs } from "@/components/PrefsProvider";

export default function PreferencesPanel() {
  const { prefs, setPrefs, resetPrefs } = usePrefs();

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="text-sm font-semibold text-black">Preferences</div>

      <label className="flex items-center gap-2 text-sm text-black">
        <input type="checkbox" checked={prefs.showRebuttalScores}
               onChange={e => setPrefs({ showRebuttalScores: e.target.checked })}/>
        Show rebuttal match %s
      </label>

      <label className="flex items-center gap-2 text-sm text-black">
        <input type="checkbox" checked={prefs.showCustomerQuotes}
               onChange={e => setPrefs({ showCustomerQuotes: e.target.checked })}/>
        Show extra customer quotes
      </label>

      <label className="flex items-center gap-2 text-sm text-black">
        <input type="checkbox" checked={prefs.showActions}
               onChange={e => setPrefs({ showActions: e.target.checked })}/>
        Show action buttons (debug)
      </label>

      <label className="flex items-center gap-2 text-sm text-black">
        <input type="checkbox" checked={prefs.compactUI}
               onChange={e => setPrefs({ compactUI: e.target.checked })}/>
        Compact UI
      </label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="text-xs text-slate-600">Language</div>
        <select
          className="rounded border p-2 text-sm text-black md:col-span-2"
          value={prefs.language}
          onChange={e => setPrefs({ language: e.target.value as any })}
        >
          <option value="auto">Auto (English/Spanish)</option>
          <option value="en">English only</option>
          <option value="es">Spanish only</option>
        </select>

        <div className="text-xs text-slate-600">Timezone</div>
        <input
          className="rounded border p-2 text-sm text-black md:col-span-2"
          value={prefs.timezone}
          onChange={e => setPrefs({ timezone: e.target.value })}
          placeholder="America/New_York"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="text-xs text-slate-600">Card redaction</div>
        <select
          className="rounded border p-2 text-sm text-black md:col-span-2"
          value={prefs.redactCC}
          onChange={e => setPrefs({ redactCC: e.target.value as any })}
        >
          <option value="last4">Mask except last 4</option>
          <option value="none">No masking (dev)</option>
        </select>
      </div>

      <button onClick={resetPrefs} className="rounded border px-3 py-1 text-sm text-black">
        Reset to defaults
      </button>
    </div>
  );
}