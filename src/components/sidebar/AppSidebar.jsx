import { Files, Folder, History } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import CollectionsView from './CollectionsView.jsx';
import HistoryView from './HistoryView.jsx';
import TabsView from './TabsView.jsx';

const SIDEBAR_VIEWS = [
  {
    id: 'collections',
    labelKey: 'sidebar.collections',
    Icon: Folder,
    activeClass: 'border-yellow-500/60 bg-yellow-500/10 text-yellow-100',
    iconClass: 'text-yellow-500'
  },
  {
    id: 'tabs',
    labelKey: 'sidebar.tabs',
    Icon: Files,
    activeClass: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100',
    iconClass: 'text-emerald-400'
  },
  {
    id: 'history',
    labelKey: 'sidebar.history',
    Icon: History,
    activeClass: 'border-blue-500/60 bg-blue-500/10 text-blue-100',
    iconClass: 'text-blue-400'
  }
];

export default function AppSidebar({
  isOpen,
  view,
  tabsState,
  historyState,
  collectionsState,
  actions
}) {
  const { t } = useTranslation();
  const activeView = SIDEBAR_VIEWS.some(item => item.id === view) ? view : 'collections';
  const viewCounts = {
    collections: collectionsState.collections.length,
    tabs: tabsState.tabs.length,
    history: historyState.history.length
  };
  const closeOverlaySidebar = () => {
    if (window.matchMedia?.('(max-width: 1279px)').matches) {
      actions.setIsSidebarOpen(false);
    }
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label={t('sidebar.close')}
          onClick={() => actions.setIsSidebarOpen(false)}
          className="absolute inset-0 z-20 bg-black/45 backdrop-blur-[1px] xl:hidden"
        />
      )}
      <div className={`absolute inset-y-0 left-0 z-30 flex flex-col flex-shrink-0 overflow-hidden border-r border-gray-800 bg-gray-950 shadow-2xl transition-all duration-300 ease-in-out xl:relative xl:shadow-none ${
        isOpen
          ? 'w-[min(22rem,88vw)] translate-x-0 xl:w-72 2xl:w-80'
          : 'w-[min(22rem,88vw)] -translate-x-full xl:w-0 xl:translate-x-0 xl:border-none xl:opacity-0'
      }`}>
      <div className="w-[min(22rem,88vw)] xl:w-72 2xl:w-80 flex flex-col h-full">
        <div
          role="tablist"
          aria-label={t('sidebar.navigation')}
          className="grid grid-cols-3 gap-1 border-b border-gray-800 bg-gray-950 p-2"
        >
          {SIDEBAR_VIEWS.map(({ id, labelKey, Icon, activeClass, iconClass }) => {
            const isActive = activeView === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => actions.setSidebarView(id)}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded border px-2 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? activeClass
                    : 'border-transparent text-gray-500 hover:border-gray-800 hover:bg-gray-900 hover:text-gray-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? iconClass : ''}`} />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>

        <div className={activeView === 'tabs' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <TabsView
            {...tabsState}
            onAdd={actions.handleAddRequestTab}
            onSwitch={(tab) => {
              actions.handleSwitchRequestTab(tab);
              closeOverlaySidebar();
            }}
            onClose={actions.handleCloseRequestTab}
          />
        </div>

        <div className={activeView === 'history' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <HistoryView
            {...historyState}
            onSelect={(item) => {
              actions.loadHistoryItem(item);
              closeOverlaySidebar();
            }}
            onDelete={actions.handleDeleteHistoryItem}
            onClear={actions.handleClearHistory}
          />
        </div>

        <div className={activeView === 'collections' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <CollectionsView
            state={collectionsState}
            actions={{
              ...actions,
              loadCollectionItem: (item) => {
                actions.loadCollectionItem(item);
                closeOverlaySidebar();
              }
            }}
          />
        </div>
      </div>
      </div>
    </>
  );
}
