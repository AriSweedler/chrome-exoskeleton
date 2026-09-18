import {Notifications} from '@exo/lib/toast-notification';

/**
 * Type "XXX" into the Google Doc and scroll to the bottom.
 *
 * Google Docs uses a contenteditable div, so we simulate real key presses
 * via keyboard events + execCommand for insertion, then scroll the
 * document container to the bottom.
 */
// Outcome toast for the demo 'gg' chord — the e2e suite asserts on it to
// prove multi-keystroke sequences fire end-to-end.
export function announceSequenceDemo(): void {
    Notifications.show({message: 'Playground sequence: gg'});
}

export function typeXxxAndScrollToBottom(): void {
    // Google Docs' editable surface
    const editor = document.querySelector<HTMLElement>('.docs-texteventtarget-iframe');
    const iframe = editor as HTMLIFrameElement | null; // eslint-disable-line no-undef
    const editableDoc = iframe?.contentDocument;
    const editableBody = editableDoc?.body;

    if (editableBody) {
        editableBody.focus();
        editableDoc!.execCommand('insertText', false, 'XXX');
    } else {
        Notifications.show({message: 'Could not find Google Docs editor'});
        return;
    }

    // Scroll the document to the bottom
    const scroller = document.querySelector('.kix-appview-editor');
    if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
    }

    Notifications.show({message: 'Typed XXX and scrolled to bottom'});
}
