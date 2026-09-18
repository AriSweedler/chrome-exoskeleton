export class Storage {
    /**
     * Get a value from chrome.storage.local
     */
    static async get<T>(key: string): Promise<T | undefined> {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                resolve(result[key] as T | undefined);
            });
        });
    }

    /**
     * Set a value in chrome.storage.local
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async set(key: string, value: any): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({[key]: value}, () => {
                resolve();
            });
        });
    }

    /**
     * Remove a value from chrome.storage.local
     */
    static async remove(key: string): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.remove(key, () => {
                resolve();
            });
        });
    }
}
