import { useAppContext } from '../context/AppContext';

export function TabBar() {
  const { activeTab, setActiveTab } = useAppContext();

  const tabs = [
    { id: 'engage' as const, label: 'Engage' },
    { id: 'chat' as const, label: 'Chat' },
    { id: 'draft' as const, label: 'Draft' },
    { id: 'queue' as const, label: 'Queue' },
    { id: 'settings' as const, label: 'Settings' },
  ];

  return (
    <nav className="flex border-b border-slate-700" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
