import {Handler, type FormatContext} from '@exo/lib/richlink';

export class __Pascal__Handler extends Handler {
    canHandle(url: URL): boolean {
        return url.hostname === 'example.com';
    }

    getFormats(context: FormatContext) {
        return [
            this.format({
                label: '__Pascal__',
                title: document.title,
                url: context.url,
                priority: 10,
            }),
        ];
    }
}
