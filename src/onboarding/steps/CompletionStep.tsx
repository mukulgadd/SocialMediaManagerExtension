import { useState, useEffect } from 'react';
import type { VoiceProfile, ContentItem } from '../../shared/types';

interface CompletionStepProps {
  onBack: () => void;
}

interface SetupSummary {
  hasBrandIdentity: boolean;
  hasToneStyle: boolean;
  keywordCount: number;
  contentCount: number;
}

export function CompletionStep({ onBack }: CompletionStepProps) {
  const [summary, setSummary] = useState<SetupSummary>({
    hasBrandIdentity: false,
    hasToneStyle: false,
    keywordCount: 0,
    contentCount: 0,
  });

  useEffect(() => {
    chrome.storage.local.get(['voiceProfile', 'topicKeywords', 'contentLibrary']).then((result) => {
      const profile = result.voiceProfile as VoiceProfile | undefined;
      const keywords = result.topicKeywords as string[] | undefined;
      const content = result.contentLibrary as ContentItem[] | undefined;

      setSummary({
        hasBrandIdentity: !!profile?.brandIdentity,
        hasToneStyle: !!profile?.toneStyle,
        keywordCount: keywords?.length || 0,
        contentCount: content?.length || 0,
      });
    });
  }, []);

  const handleFinish = async () => {
    await chrome.storage.local.set({ onboardingComplete: true });
    // Close the onboarding tab
    window.close();
  };

  const items = [
    { label: 'Brand Identity', done: summary.hasBrandIdentity },
    { label: 'Tone & Style', done: summary.hasToneStyle },
    { label: `Topic Keywords (${summary.keywordCount})`, done: summary.keywordCount > 0 },
    { label: `Content Library (${summary.contentCount} items)`, done: summary.contentCount > 0 },
  ];

  return (
    <div className="text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-xl font-bold text-slate-100 mb-2">You're all set!</h2>
      <p className="text-sm text-slate-400 mb-8">Here's what you've configured:</p>

      <div className="max-w-sm mx-auto space-y-3 mb-8 text-left">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 p-2 bg-slate-800 rounded-md border border-slate-700">
            <span className={item.done ? 'text-green-400' : 'text-slate-600'}>
              {item.done ? '✓' : '○'}
            </span>
            <span className={`text-sm ${item.done ? 'text-slate-200' : 'text-slate-500'}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 mb-6">
        You can always update these in the Settings tab of the side panel.
      </p>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleFinish}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Start Using Extension
        </button>
      </div>
    </div>
  );
}
