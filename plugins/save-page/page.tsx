import {keybindings} from '@exo/lib/keybindings';
import {Clipboard} from '@exo/lib/clipboard';
import {Notifications, NotificationType} from '@exo/lib/toast-notification';
import {theme} from '@exo/theme/default';
import {claudePrompt, serializeDocument, snapshotFilename} from '@exo/plugins/save-page/snapshot';
import {downloadHtml} from '@exo/plugins/save-page/download';

/**
 * Save the page as it is right now to the browser's download directory and
 * put a Claude Code prompt naming that file on the clipboard. Returns the
 * filename.
 */
export async function savePageForClaude(): Promise<string> {
    const now = new Date();
    const filename = snapshotFilename(document.title, Math.floor(now.getTime() / 1000));
    // Serialize before anything of ours (the anchor, the toast) joins the DOM.
    const html = serializeDocument(document, window.location.href, now);
    downloadHtml(filename, html);

    const prompt = claudePrompt(filename);
    await Clipboard.write(prompt);

    Notifications.show({
        tag: 'save-page.saved',
        type: NotificationType.Success,
        message: 'Saved page, prompt copied',
        // Children replace the message line on screen; say it here too.
        children: (
            <>
                <div>Saved page, prompt copied</div>
                <div style={{...theme.toast.preview, marginTop: '4px'}}>{prompt}</div>
            </>
        ),
    });
    return filename;
}

keybindings.register({
    key: 'd',
    modifiers: {meta: true, shift: true},
    description: 'Save page as HTML, copy a Claude prompt for it',
    context: 'Global',
    handler: () => {
        savePageForClaude().catch((err: unknown) => {
            console.error('[exo save-page] failed', err);
            Notifications.show({
                tag: 'save-page.failed',
                type: NotificationType.Error,
                message: `Save failed: ${err instanceof Error ? err.message : String(err)}`,
            });
        });
    },
});
keybindings.listen();
