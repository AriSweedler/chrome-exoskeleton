import {Handler} from '@exo/lib/richlink/base';

export class GoogleDocsHandler extends Handler {
    readonly label = 'Google Doc';
    readonly priority = 20;

    canHandle(url: URL): boolean {
        return url.hostname === 'docs.google.com';
    }

    extractLinkText(): string {
        // Google Docs uses an input element for the document title
        // TODO: Verify this selector works across all Google Docs pages (Docs, Sheets, Slides)
        const titleInput = document.querySelector('.docs-title-input') as HTMLInputElement;
        if (titleInput?.value) {
            return titleInput.value.trim();
        }

        // Alternative selector: Some pages use a span with data-tooltip="Rename"
        const titleSpan = document.querySelector('span[data-tooltip="Rename"]');
        if (titleSpan?.textContent) {
            return titleSpan.textContent.trim();
        }

        return 'Google Doc';
    }
}
