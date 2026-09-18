import {Action} from '@exo/lib/actions/base-action';
import {Notifications, type NotificationType, type ToastHandle} from '@exo/lib/toast-notification';
import {theme} from '@exo/theme/default';

export interface ShowToastPayload {
    message: string;
    type?: NotificationType;
    duration?: number;
    detail?: string;
}

export class ShowToastAction extends Action<ShowToastPayload, void> {
    type = 'SHOW_TOAST' as const;
}

/**
 * Render a ShowToast payload as a toast: the message headline, plus an
 * optional preformatted detail block. Lives app-side — the toast library is
 * standalone and knows nothing about this extension's message payloads.
 */
export function showToastPayload(payload: ShowToastPayload): ToastHandle {
    return Notifications.show({
        message: payload.message,
        type: payload.type,
        children: payload.detail ? (
            <>
                <div style={{fontWeight: 500}}>{payload.message}</div>
                <pre
                    style={{
                        ...theme.toast.detail,
                        margin: '8px 0 0 0',
                        whiteSpace: 'pre',
                        lineHeight: '1.5',
                    }}
                >
                    {payload.detail}
                </pre>
            </>
        ) : undefined,
    });
}
