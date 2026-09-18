import {useState, useEffect} from 'react';
import {Storage} from '@exo/lib/storage';

const enablementKey = (tabId: string) => `exorun-${tabId}`;

/**
 * Whether a tab's page-side behavior should run on page load (defaults to true).
 * Page modules gate their registration on this; the popup toggle writes the same key.
 */
export async function isTabEnabled(tabId: string): Promise<boolean> {
    const value = await Storage.get<boolean>(enablementKey(tabId));
    return value === undefined ? true : value;
}

export function useTabEnablement(tabId: string) {
    const [enabled, setEnabled] = useState<boolean>(true);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const loadEnabled = async () => {
            setEnabled(await isTabEnabled(tabId));
            setLoading(false);
        };
        loadEnabled();
    }, [tabId]);

    const updateEnabled = async (newValue: boolean) => {
        await Storage.set(enablementKey(tabId), newValue);
        setEnabled(newValue);
    };

    return {enabled, loading, setEnabled: updateEnabled};
}
