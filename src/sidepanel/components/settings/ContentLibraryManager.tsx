import { useState, useEffect } from 'react';
import { CONFIG } from '../../../shared/constants';
import type { ContentItem } from '../../../shared/types';

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

interface ContentFormProps {
  initial?: ContentItem;
  onSave: (item: Omit<ContentItem, 'id'>) => void;
  onCancel: () => void;
}

function ContentForm({ initial, onSave, onCancel }: ContentFormProps) {
  const [title, setTitle] = useState(initial?.title || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [keywords, setKeywords] = useState(initial?.topicKeywords.join(', ') || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [urlError, setUrlError] = useState('');

  const handleSubmit = () => {
    if (!title.trim() || !url.trim()) return;
    if (!isValidUrl(url)) {
      setUrlError('Please enter a valid URL');
      return;
    }
    setUrlError('');
    onSave({
      title: title.trim(),
      url: url.trim(),
      topicKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="space-y-3 p-3 bg-slate-900 rounded-md border border-slate-600">
      <div>
        <label htmlFor="content-title" className="block text-xs text-slate-400 mb-1">Title *</label>
        <input
          id="content-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article or post title"
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="content-url" className="block text-xs text-slate-400 mb-1">URL *</label>
        <input
          id="content-url"
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setUrlError(''); }}
          placeholder="https://..."
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
      </div>
      <div>
        <label htmlFor="content-keywords" className="block text-xs text-slate-400 mb-1">Keywords (comma-separated)</label>
        <input
          id="content-keywords"
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="react, typescript, web dev"
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="content-description" className="block text-xs text-slate-400 mb-1">Description (optional)</label>
        <textarea
          id="content-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Brief description of this content..."
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        >
          {initial ? 'Update' : 'Add'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContentLibraryManager() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get('contentLibrary').then((result) => {
      if (result.contentLibrary) {
        setItems(result.contentLibrary as ContentItem[]);
      }
    });
  }, []);

  const save = async (updated: ContentItem[]) => {
    setItems(updated);
    await chrome.storage.local.set({ contentLibrary: updated });
  };

  const handleAdd = (data: Omit<ContentItem, 'id'>) => {
    if (items.length >= CONFIG.MAX_CONTENT_LIBRARY_ITEMS) return;
    const newItem: ContentItem = { ...data, id: crypto.randomUUID() };
    save([...items, newItem]);
    setShowForm(false);
  };

  const handleEdit = (data: Omit<ContentItem, 'id'>) => {
    const updated = items.map((item) =>
      item.id === editingId ? { ...data, id: item.id } : item
    );
    save(updated);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    save(items.filter((item) => item.id !== id));
  };

  return (
    <section className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-200">Content Library</h3>
        <span className="text-xs text-slate-500">{items.length}/{CONFIG.MAX_CONTENT_LIBRARY_ITEMS}</span>
      </div>

      <div className="space-y-2 mb-3">
        {items.map((item) =>
          editingId === item.id ? (
            <ContentForm
              key={item.id}
              initial={item}
              onSave={handleEdit}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={item.id} className="flex items-start justify-between p-2 bg-slate-900 rounded-md border border-slate-700">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200 truncate">{item.title}</p>
                <p className="text-xs text-slate-500 truncate">{item.url}</p>
                {item.topicKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.topicKeywords.map((kw) => (
                      <span key={kw} className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-300 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 ml-2 shrink-0">
                <button
                  onClick={() => setEditingId(item.id)}
                  className="text-xs text-slate-400 hover:text-blue-400 transition-colors"
                  aria-label={`Edit ${item.title}`}
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                  aria-label={`Delete ${item.title}`}
                >
                  ✕
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {showForm ? (
        <ContentForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          disabled={items.length >= CONFIG.MAX_CONTENT_LIBRARY_ITEMS}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
        >
          + Add Content
        </button>
      )}
    </section>
  );
}
