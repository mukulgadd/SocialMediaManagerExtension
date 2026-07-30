import { useState } from 'react';
import { VoiceProfileEditor } from './VoiceProfileEditor';
import { ContentLibraryManager } from './ContentLibraryManager';
import { TopicKeywordsInput } from './TopicKeywordsInput';
import { EngagementLimitsConfig } from './EngagementLimitsConfig';
import { TrackedAccountsManager } from './TrackedAccountsManager';

export function SettingsPage() {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = async () => {
    await chrome.storage.local.clear();
    setShowResetConfirm(false);
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <VoiceProfileEditor />
      <TopicKeywordsInput />
      <ContentLibraryManager />
      <TrackedAccountsManager />
      <EngagementLimitsConfig />

      {/* Reset & Version */}
      <div className="pt-4 border-t border-slate-700">
        {showResetConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-400">Reset all data?</span>
            <button
              onClick={handleReset}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-1.5 bg-red-900/50 hover:bg-red-900/80 text-red-300 text-sm rounded-md border border-red-800 transition-colors"
          >
            Reset All Settings
          </button>
        )}

        <p className="mt-3 text-xs text-slate-600">v1.0.0</p>
      </div>
    </div>
  );
}
