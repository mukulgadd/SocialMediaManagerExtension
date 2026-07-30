import { useState, useEffect } from 'react';
import { CONFIG } from '../../shared/constants';

interface IdentityStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function IdentityStep({ onNext, onBack }: IdentityStepProps) {
  const [brandIdentity, setBrandIdentity] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    chrome.storage.local.get(['voiceProfile', 'topicKeywords']).then((result) => {
      if (result.voiceProfile?.brandIdentity) {
        setBrandIdentity(result.voiceProfile.brandIdentity);
      }
      if (result.topicKeywords) {
        setKeywords(result.topicKeywords);
      }
    });
  }, []);

  const addKeywords = () => {
    const newKws = keywordInput
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && !keywords.includes(k));
    const combined = [...keywords, ...newKws].slice(0, CONFIG.MAX_TOPIC_KEYWORDS);
    setKeywords(combined);
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeywords();
    }
  };

  const handleNext = async () => {
    // Save immediately
    const existing = await chrome.storage.local.get('voiceProfile');
    await chrome.storage.local.set({
      voiceProfile: {
        brandIdentity,
        toneStyle: existing.voiceProfile?.toneStyle || '',
      },
      topicKeywords: keywords,
    });
    onNext();
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-100 mb-1">Who are you?</h2>
      <p className="text-sm text-slate-400 mb-6">Tell us about your brand so AI replies match your identity.</p>

      <div className="space-y-4">
        <div>
          <label htmlFor="onboard-brand" className="block text-xs text-slate-400 mb-1">
            Brand Identity
          </label>
          <textarea
            id="onboard-brand"
            value={brandIdentity}
            onChange={(e) => setBrandIdentity(e.target.value.slice(0, CONFIG.VOICE_PROFILE_MAX_CHARS))}
            maxLength={CONFIG.VOICE_PROFILE_MAX_CHARS}
            rows={5}
            placeholder="I'm a developer advocate at... I focus on..."
            className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1 text-right">
            {brandIdentity.length}/{CONFIG.VOICE_PROFILE_MAX_CHARS}
          </p>
        </div>

        <div>
          <label htmlFor="onboard-keywords" className="block text-xs text-slate-400 mb-1">
            Topic Keywords ({keywords.length}/{CONFIG.MAX_TOPIC_KEYWORDS})
          </label>
          <div className="flex gap-2">
            <input
              id="onboard-keywords"
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="typescript, react, devtools"
              disabled={keywords.length >= CONFIG.MAX_TOPIC_KEYWORDS}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              onClick={addKeywords}
              disabled={!keywordInput.trim() || keywords.length >= CONFIG.MAX_TOPIC_KEYWORDS}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm rounded-md transition-colors"
            >
              Add
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {keywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded-full">
                  {kw}
                  <button
                    onClick={() => removeKeyword(kw)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    aria-label={`Remove ${kw}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
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
