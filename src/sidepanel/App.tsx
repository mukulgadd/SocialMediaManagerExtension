import { AppProvider, useAppContext } from './context/AppContext';
import { StorageSync } from './context/StorageSync';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { EngageTab } from './components/engage/EngageTab';
import { ChatTab } from './components/chat/ChatTab';
import { DraftTab } from './components/draft/DraftTab';
import { SummaryTab } from './components/summary/SummaryTab';
import { QueueTab } from './components/queue/QueueTab';
import { SettingsPage } from './components/settings/SettingsPage';
import { usePlatform } from './hooks/usePlatform';

function AppContent() {
  const { activeTab } = useAppContext();

  // Initialize platform detection
  usePlatform();

  return (
    <div className="flex flex-col h-screen min-w-[320px] bg-slate-800 text-white">
      <StorageSync />
      <Header />
      <TabBar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'engage' && <EngageTab />}
        {activeTab === 'chat' && <ChatTab />}
        {activeTab === 'draft' && <DraftTab />}
        {activeTab === 'summary' && <SummaryTab />}
        {activeTab === 'queue' && <QueueTab />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
