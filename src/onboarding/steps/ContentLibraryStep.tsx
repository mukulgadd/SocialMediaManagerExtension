import { useState, useEffect } from 'react';
import type { ContentItem } from '../../shared/types';

interface ContentLibraryStepProps {
  onNext: () => void;
  onBack: () => void;
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

export function ContentLibraryStep({ onNext, onBack }: ContentLibraryStepProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    chrome.storage.local.get('contentLibrary').then((result) => {
      if (result.contentLibrary) {
        setItems(result.contentLibrary as ContentItem[]);
      }
    });
  }, []);

  const handleAdd = async () => {
    if (!title.trim() || !url.trim()) return;
    if (!isValidUrl(url)) {
      setUrlError('Please enter a valid URL');
      return;
    }
    setUrlError('');

    const newItem: ContentItem = {
      id: crypto.randomUUID(),
      title: title.trim(),
      url: url.trim(),
      topicKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
    };

    const updated = [...items, newItem];
    setItems(updated);
    await chrome.storage.local.set({ contentLibrary: updated });

    setTitle('');
    setUrl('');
    setKeywords('');
  };

  const handleRemove = async (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    await chrome.storage.local.set({ contentLibrary: updated });
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-100 mb-1">What have you published?</h2>
      <p className="text-sm text-slate-400 mb-6">
        Add your best content so AI can reference it in replies. This step is optional.
      </p>

      {/* Existing items */}
      {items.length > 0 && (
        <div className="space-y-2 mb-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-slate-800 rounded-md border border-slate-700">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200 truncate">{item.title}</p>
                <p className="text-xs text-slate-500 truncate">{item.url}</p>
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="ml-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
                aria-label={`Remove ${item.title}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {items.length < 5 && (
        <div className="space-y-3 p-3 bg-slate-800/50 rounded-md border border-slate-700">
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(''); }}
              placeholder="https://..."
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
          </div>
          <div>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Keywords (comma-separated)"
              className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!title.trim() || !url.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            + Add
          </button>
        </div>
      )}

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </button>
        <div className="flex gap-2">
          <button
            onClick={onNext}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onNext}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
