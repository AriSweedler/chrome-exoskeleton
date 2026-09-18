import {ShowToastAction, type ShowToastPayload} from '@exo/lib/actions/show-toast.action';

/** Retry sending the toast until the content script is ready (up to ~2s). */
async function sendToastWithRetry(tabId: number, toast: ShowToastPayload): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            await ShowToastAction.sendToTab(tabId, toast);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 200));
        }
    }
}

/** Navigate a tab and show a toast after the new page loads. */
export async function navigateAndToast(
    tabId: number,
    url: string,
    toast: ShowToastPayload,
): Promise<void> {
    const onUpdated = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedId !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        sendToastWithRetry(tabId, toast);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    await chrome.tabs.update(tabId, {url});
}
