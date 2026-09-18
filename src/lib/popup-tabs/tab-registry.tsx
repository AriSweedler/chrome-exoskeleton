import {ComponentType} from 'react';

/** The priority meaning "this tab doesn't match the page" — hidden from the popup. */
const NO_MATCH = Number.MAX_SAFE_INTEGER;

/** A getPriority for tabs that simply match a page or don't. */
export const matchPriority =
    (matches: (url: string) => boolean) =>
    (url: string): number =>
        matches(url) ? 0 : NO_MATCH;

export interface TabRegistration {
    id: string;
    label: string;
    component: ComponentType;
    getPriority: (url: string) => number;
    enablementToggle?: boolean;
}

export class TabRegistry {
    private static tabs: TabRegistration[] = [];

    static register(config: TabRegistration): void {
        if (this.tabs.some((t) => t.id === config.id)) {
            throw new Error(`Tab ID '${config.id}' already registered`);
        }
        this.tabs.push(config);
    }

    static getVisibleTabs(url: string): Array<TabRegistration & {priority: number}> {
        return this.tabs
            .map((tab) => ({...tab, priority: tab.getPriority(url)}))
            .filter((tab) => tab.priority !== NO_MATCH)
            .sort((a, b) => a.priority - b.priority);
    }

    /**
     * Clear all registered tabs (for testing only)
     * @internal
     */
    static clearForTesting(): void {
        this.tabs = [];
    }
}
