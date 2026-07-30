import { useState, useEffect, useCallback } from 'react';
import type { QueueItem, Platform } from '../../../shared/types';
import type { ResponseMessage } from '../../../shared/messages';

function platformLabel(p: Platform): string {
  switch (p) {
    case 'linkedin': return 'LinkedIn';
    case 'x-twitter': return 'X';
    case 'youtube': return 'YouTube';
    case 'substack': return 'Substack';
    default: return p;
  }
}

function platformBadgeClass(p: Platform): string {
  switch (p) {
    case 'linkedin': return 'bg-blue-900/40 text-blue-300 border-blue-700/50';
    case 'x-twitter': return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
    case 'youtube': return 'bg-red-900/40 text-red-300 border-red-700/50';
    case 'substack': return 'bg-orange-900/40 text-orange-300 border-orange-700/50';
    default: return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
  }
}

function formatScheduledTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

interface QueueItemCardProps {
  item: QueueItem;
  onDelete: (id: string) => void;
  onMarkPosted: (id: string) => void;
}

function QueueItemCard({ item, onDelete, onMarkPosted }: QueueItemCardProps) {
  const isPast = item.scheduledTime < Date.now() && item.status === 'draft';
  const contentPreview = item.content.length > 120
    ? item.content.slice(0, 120) + '…'
    : item.content;

  return (
    <div className={`p-3 border rounded-lg ${
      item.status === 'posted'
        ? 'bg-slate-800/50 border-slate-700/50 opacity-60'
        : isPast
          ? 'bg-amber-900/10 border-amber-700/50'
          : 'bg-slate-800 border-slate-700'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 text-xs rounded border ${platformBadgeClass(item.platform)}`}>
            {platformLabel(item.platform)}
          </span>
          {item.status === 'posted' && (
            <span className="text-xs text-green-400">✓ Posted</span>
          )}
          {isPast && (
            <span className="text-xs text-amber-400">⏰ Overdue</span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {formatScheduledTime(item.scheduledTime)}
        </span>
      </div>

      {/* Content preview */}
      <p className="mt-2 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{contentPreview}</p>

      {/* Actions */}
      {item.status === 'draft' && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onMarkPosted(item.id)}
            className="px-2.5 py-1 text-xs bg-green-700/50 hover:bg-green-700/80 text-green-200 rounded transition-colors"
          >
            Mark Posted
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-red-900/50 text-slate-400 hover:text-red-300 rounded transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function QueueTab() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'QUEUE_GET_ALL' }).then((response: ResponseMessage | undefined) => {
      if (response && 'items' in response) {
        setItems((response as { type: 'QUEUE_ITEMS'; items: QueueItem[] }).items);
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'QUEUE_REMOVE', id }).then(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    });
  }, []);

  const handleMarkPosted = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'QUEUE_MARK_POSTED', id }).then((response) => {
      if (response && 'item' in response) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: 'posted' as const } : item))
        );
      }
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 bg-slate-800 border border-slate-700 rounded-lg animate-pulse">
            <div className="w-16 h-4 bg-slate-700 rounded" />
            <div className="mt-2 w-full h-3 bg-slate-700 rounded" />
            <div className="mt-1 w-2/3 h-3 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const draftItems = items.filter((i) => i.status === 'draft');
  const postedItems = items.filter((i) => i.status === 'posted');

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-3">📋</span>
          <h2 className="text-sm font-medium text-slate-200">No queued content</h2>
          <p className="mt-1 text-xs text-slate-400">
            Use the Draft tab to create content, then add it to your queue.
          </p>
        </div>
      ) : (
        <>
          {/* Upcoming / Draft items */}
          {draftItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Upcoming ({draftItems.length})
              </h3>
              {draftItems.map((item) => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                  onMarkPosted={handleMarkPosted}
                />
              ))}
            </div>
          )}

          {/* Posted items */}
          {postedItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Posted ({postedItems.length})
              </h3>
              {postedItems.map((item) => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  onDelete={handleDelete}
                  onMarkPosted={handleMarkPosted}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
