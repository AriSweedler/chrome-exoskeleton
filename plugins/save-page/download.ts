/**
 * Hand `html` to the browser as a download called `filename`. Chrome writes
 * it to its download directory with no dialog (unless the reader has asked
 * to be prompted for every download). The blob is the page's own, so the
 * name is honored as given.
 */
export function downloadHtml(filename: string, html: string): void {
    const href = URL.createObjectURL(new Blob([html], {type: 'text/html'}));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.style.display = 'none';
    (document.body ?? document.documentElement).appendChild(anchor);
    try {
        anchor.click();
    } finally {
        anchor.remove();
        // The click has handed the blob to the download; the URL can go once
        // the browser has had a moment to start it.
        setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
}
