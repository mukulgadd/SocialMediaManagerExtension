import { useState, useEffect } from 'react';
import { CONFIG } from '../../shared/constants';

interface ToneStepProps {
  onNext: () => void;
  onBack: () => void;
}

const PRESETS: { label: string; value: string }[] = [
  {
    label: 'Professional & Direct',
    value: 'I write in a professional, direct tone. I keep sentences concise and focus on delivering value. I avoid filler words and get straight to the point while remaining approachable.',
  },
  {
    label: 'Casual & Witty',
    value: 'I write casually with a touch of humor. I use conversational language, occasional wordplay, and keep things light while still being insightful. I\'m relatable and fun to read.',
  },
  {
    label: 'Analytical',
    value: 'I write with an analytical, data-driven approach. I reference numbers, trends, and evidence. I structure my thoughts logically and present clear arguments backed by reasoning.',
  },
];

export function ToneStep({ onNext, onBack }: ToneStepProps) {
  const [toneStyle, setToneStyle] = useState('');

  useEffect(() => {
    chrome.storage.local.get('voiceProfile').then((result) => {
      if (result.voiceProfile?.toneStyle) {
        setToneStyle(result.voiceProfile.toneStyle);
      }
    });
  }, []);

  const applyPreset = (value: string) => {
    setToneStyle(value);
  };

  const handleNext = async () => {
    const existing = await chrome.storage.local.get('voiceProfile');
    await chrome.storage.local.set({
      voiceProfile: {
        brandIdentity: existing.voiceProfile?.brandIdentity || '',
        toneStyle,
      },
    });
    onNext();
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-100 mb-1">How do you write?</h2>
      <p className="text-sm text-slate-400 mb-6">Describe your writing style or pick a preset to start.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset.value)}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-full border border-slate-600 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="onboard-tone" className="block text-xs text-slate-400 mb-1">
          Tone &amp; Style
        </label>
        <textarea
          id="onboard-tone"
          value={toneStyle}
          onChange={(e) => setToneStyle(e.target.value.slice(0, CONFIG.VOICE_PROFILE_MAX_CHARS))}
          maxLength={CONFIG.VOICE_PROFILE_MAX_CHARS}
          rows={6}
          placeholder="Describe how you write: your tone, vocabulary, and style preferences..."
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1 text-right">
          {toneStyle.length}/{CONFIG.VOICE_PROFILE_MAX_CHARS}
        </p>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleNext}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
