import { useState, useEffect } from 'react';
import { CONFIG } from '../../../shared/constants';
import type { VoiceProfile } from '../../../shared/types';

export function VoiceProfileEditor() {
  const [brandIdentity, setBrandIdentity] = useState('');
  const [toneStyle, setToneStyle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('voiceProfile').then((result) => {
      const profile = result.voiceProfile as VoiceProfile | undefined;
      if (profile) {
        setBrandIdentity(profile.brandIdentity || '');
        setToneStyle(profile.toneStyle || '');
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await chrome.storage.local.set({
      voiceProfile: { brandIdentity, toneStyle },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h3 className="text-sm font-medium text-slate-200 mb-3">Voice Profile</h3>

      <div className="space-y-4">
        <div>
          <label htmlFor="brand-identity" className="block text-xs text-slate-400 mb-1">
            Brand Identity
          </label>
          <textarea
            id="brand-identity"
            value={brandIdentity}
            onChange={(e) => setBrandIdentity(e.target.value.slice(0, CONFIG.VOICE_PROFILE_MAX_CHARS))}
            maxLength={CONFIG.VOICE_PROFILE_MAX_CHARS}
            rows={4}
            placeholder="Describe who you are, what you do, and what makes you unique..."
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1 text-right">
            {brandIdentity.length}/{CONFIG.VOICE_PROFILE_MAX_CHARS}
          </p>
        </div>

        <div>
          <label htmlFor="tone-style" className="block text-xs text-slate-400 mb-1">
            Tone &amp; Style
          </label>
          <textarea
            id="tone-style"
            value={toneStyle}
            onChange={(e) => setToneStyle(e.target.value.slice(0, CONFIG.VOICE_PROFILE_MAX_CHARS))}
            maxLength={CONFIG.VOICE_PROFILE_MAX_CHARS}
            rows={4}
            placeholder="Describe how you write: your tone, vocabulary preferences, and style..."
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1 text-right">
            {toneStyle.length}/{CONFIG.VOICE_PROFILE_MAX_CHARS}
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
      >
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Profile'}
      </button>
    </section>
  );
}
