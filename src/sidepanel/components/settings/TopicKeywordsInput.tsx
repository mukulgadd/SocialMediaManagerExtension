import { useState, useEffect } from 'react';
import { CONFIG } from '../../../shared/constants';

export function TopicKeywordsInput() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('topicKeywords').then((result) => {
      if (result.topicKeywords) {
        setKeywords(result.topicKeywords as string[]);
      }
    });
  }, []);

  const addKeywords = () => {
    const newKeywords = input
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && !keywords.includes(k));

    const combined = [...keywords, ...newKeywords].slice(0, CONFIG.MAX_TOPIC_KEYWORDS);
    setKeywords(combined);
    setInput('');
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeywords();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await chrome.storage.local.set({ topicKeywords: keywords });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-200">Topic Keywords</h3>
        <span className="text-xs text-slate-500">{keywords.length}/{CONFIG.MAX_TOPIC_KEYWORDS}</span>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add keywords, separated by commas"
          disabled={keywords.length >= CONFIG.MAX_TOPIC_KEYWORDS}
          className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          onClick={addKeywords}
          disabled={!input.trim() || keywords.length >= CONFIG.MAX_TOPIC_KEYWORDS}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm rounded-md transition-colors"
        >
          Add
        </button>
      </div>

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {keywords.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded-full"
            >
              {keyword}
              <button
                onClick={() => removeKeyword(keyword)}
                className="text-slate-500 hover:text-red-400 transition-colors"
                aria-label={`Remove ${keyword}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
      >
        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Keywords'}
      </button>
    </section>
  );
}
