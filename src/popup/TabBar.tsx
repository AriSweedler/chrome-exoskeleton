import {useState, useEffect} from 'react';
import {TabRegistry} from '@exo/lib/popup-tabs/tab-registry';
import {Storage} from '@exo/lib/storage';
import {TabErrorBoundary} from '@exo/popup/TabErrorBoundary';
import {TabEnablementSection} from '@exo/lib/popup-tabs/TabEnablementSection';
// eslint-disable-next-line no-restricted-imports -- CSS must use relative imports
import './TabBar.css';

export function TabBar() {
    const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
    // null = the active tab's URL hasn't loaded yet — distinct from "no match"
    const [currentUrl, setCurrentUrl] = useState<string | null>(null);
    const [currentTabId, setCurrentTabId] = useState<number | null>(null);

    useEffect(() => {
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            const tab = tabs[0];
            setCurrentUrl(tab.url || '');
            setCurrentTabId(tab.id || null);

            // Load last selected popup tab for this browser tab
            const storageKey = `selectedTab:${tab.id}`;
            const stored = await Storage.get<string>(storageKey);

            // Get visible tabs for this URL
            const visible = TabRegistry.getVisibleTabs(tab.url || '');

            // Use stored selection if valid, otherwise default to first visible
            const validStored = stored && visible.some((t) => t.id === stored);
            setSelectedTabId(validStored ? stored : visible[0]?.id || null);
        });
    }, []);

    const handleTabSelect = async (tabId: string) => {
        setSelectedTabId(tabId);
        if (currentTabId) {
            await Storage.set(`selectedTab:${currentTabId}`, tabId);
        }
    };

    if (currentUrl === null) {
        return null;
    }

    const visibleTabs = TabRegistry.getVisibleTabs(currentUrl);
    const selectedTab = visibleTabs.find((t) => t.id === selectedTabId);

    if (visibleTabs.length === 0) {
        return (
            <div className="tab-empty-state">
                No exo tools match this page.
                <br />
                Keyboard shortcuts still work — press <kbd>?</kbd> on any page.
            </div>
        );
    }

    return (
        <>
            <div className="tab-navigation">
                {visibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={tab.id === selectedTabId ? 'active' : ''}
                        onClick={() => handleTabSelect(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="tab-content">
                {selectedTab && (
                    <TabErrorBoundary>
                        <selectedTab.component />

                        {selectedTab.enablementToggle && (
                            <TabEnablementSection tabId={selectedTab.id} />
                        )}
                    </TabErrorBoundary>
                )}
            </div>
        </>
    );
}
