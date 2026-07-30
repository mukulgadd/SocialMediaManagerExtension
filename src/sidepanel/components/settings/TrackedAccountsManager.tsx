import { useState, useEffect } from 'react';
import type { TrackedAccount, Platform } from '../../../shared/types';

const MAX_ACCOUNTS = 10;

export function TrackedAccountsManager() {
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: '', handle: '', platform: 'linkedin' as Platform, notes: '' });

  useEffect(() => {
    chrome.storage.local.get('trackedAccounts').then((result) => {
      if (result.trackedAccounts) {
        setAccounts(result.trackedAccounts);
      }
    });
  }, []);

  const save = async (updated: TrackedAccount[]) => {
    setAccounts(updated);
    await chrome.storage.local.set({ trackedAccounts: updated });
  };

  const resetForm = () => {
    setForm({ displayName: '', handle: '', platform: 'linkedin', notes: '' });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!form.displayName.trim() || !form.handle.trim()) return;
    const newAccount: TrackedAccount = {
      id: crypto.randomUUID(),
      displayName: form.displayName.trim(),
      handle: form.handle.trim(),
      platform: form.platform,
      notes: form.notes.trim() || undefined,
    };
    await save([...accounts, newAccount]);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingId || !form.displayName.trim() || !form.handle.trim()) return;
    const updated = accounts.map((a) =>
      a.id === editingId
        ? { ...a, displayName: form.displayName.trim(), handle: form.handle.trim(), platform: form.platform, notes: form.notes.trim() || undefined }
        : a
    );
    await save(updated);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await save(accounts.filter((a) => a.id !== id));
  };

  const startEdit = (account: TrackedAccount) => {
    setForm({ displayName: account.displayName, handle: account.handle, platform: account.platform, notes: account.notes || '' });
    setEditingId(account.id);
    setIsAdding(false);
  };

  const platformLabel = (p: Platform) => {
    switch (p) {
      case 'linkedin': return 'LinkedIn';
      case 'x-twitter': return 'X';
      case 'youtube': return 'YouTube';
      case 'substack': return 'Substack';
      default: return p;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Tracked Accounts</h3>
        <span className="text-xs text-slate-500">{accounts.length}/{MAX_ACCOUNTS}</span>
      </div>
      <p className="text-xs text-slate-400">
        Track creators in your niche. Their posts will be boosted in your feed.
      </p>

      {/* Account list */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-2 bg-slate-700/50 border border-slate-600/50 rounded-md"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200 truncate">{account.displayName}</span>
                  <span className="text-xs text-slate-500">@{account.handle}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-blue-400">{platformLabel(account.platform)}</span>
                  {account.notes && <span className="text-xs text-slate-500 truncate">{account.notes}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => startEdit(account)}
                  className="p-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label={`Edit ${account.displayName}`}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="p-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
                  aria-label={`Delete ${account.displayName}`}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {(isAdding || editingId) && (
        <div className="p-3 bg-slate-700/30 border border-slate-600/50 rounded-lg space-y-2">
          <input
            type="text"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Display name"
            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={form.handle}
            onChange={(e) => setForm({ ...form, handle: e.target.value })}
            placeholder="Handle (e.g. johndoe or linkedin.com/in/johndoe)"
            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}
            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="linkedin">LinkedIn</option>
            <option value="x-twitter">X (Twitter)</option>
            <option value="youtube">YouTube</option>
            <option value="substack">Substack</option>
          </select>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (e.g. competitor, niche expert)"
            className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleAdd}
              disabled={!form.displayName.trim() || !form.handle.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
            >
              {editingId ? 'Update' : 'Add'}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!isAdding && !editingId && accounts.length < MAX_ACCOUNTS && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full px-3 py-2 border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors"
        >
          + Add Tracked Account
        </button>
      )}
    </div>
  );
}
