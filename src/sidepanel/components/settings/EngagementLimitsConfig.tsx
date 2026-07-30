import { useState, useEffect } from 'react';
import { CONFIG } from '../../../shared/constants';
import type { LimiterConfig } from '../../../shared/types';

export function EngagementLimitsConfig() {
  const [cooldown, setCooldown] = useState<number>(CONFIG.DEFAULT_COOLDOWN_SECONDS);
  const [dailyCap, setDailyCap] = useState<number>(CONFIG.DEFAULT_DAILY_CAP);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('engagementConfig').then((result) => {
      const config = result.engagementConfig as LimiterConfig | undefined;
      if (config) {
        setCooldown(config.cooldownSeconds);
        setDailyCap(config.dailyCap);
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await chrome.storage.local.set({
      engagementConfig: { cooldownSeconds: cooldown, dailyCap },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-200 mb-4">Engagement Limits</h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <label htmlFor="cooldown-slider" className="text-xs text-slate-400">
              Cooldown between actions
            </label>
            <span className="text-xs text-slate-300 font-medium">{cooldown}s</span>
          </div>
          <input
            id="cooldown-slider"
            type="range"
            min={15}
            max={120}
            step={5}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
            <span>15s</span>
            <span>120s</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label htmlFor="daily-cap-slider" className="text-xs text-slate-400">
              Daily action cap
            </label>
            <span className="text-xs text-slate-300 font-medium">{dailyCap}</span>
          </div>
          <input
            id="daily-cap-slider"
            type="range"
            min={10}
            max={200}
            step={5}
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
            <span>10</span>
            <span>200</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
      >
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Limits'}
      </button>
    </section>
  );
}
