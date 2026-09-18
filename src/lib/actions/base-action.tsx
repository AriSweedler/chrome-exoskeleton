export abstract class Action<_TPayload, _TResult> {
    abstract readonly type: string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static handlers = new Map<string, ActionHandler<any, any, any>>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static contexts = new Map<string, any>();

    /**
     * Register a handler for this action type with optional context
     */
    static handle<TPayload, TResult, TContext = void>(
        this: new () => Action<TPayload, TResult>,
        handler: ActionHandler<TPayload, TResult, TContext>,
    ): void {
        const instance = new this();
        const type = instance.type;

        if (Action.handlers.has(type)) {
            throw new Error(`Handler for action type "${type}" is already registered`);
        }

        Action.handlers.set(type, handler);

        // Set up Chrome message listener (only once globally)
        if (Action.handlers.size === 1) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                const handler = Action.handlers.get(message.type);
                if (handler) {
                    const context = Action.contexts.get(message.type);
                    Promise.resolve(handler(message.payload, sender, context))
                        .then((result) => sendResponse({success: true, data: result}))
                        .catch((error) =>
                            sendResponse({
                                success: false,
                                error: error.message || 'Unknown error',
                            }),
                        );
                    return true; // Keep channel open for async response
                }
                return false;
            });
        }
    }

    /**
     * Set context for this action's handler
     */
    static setContext<TContext>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: new () => Action<any, any>,
        context: TContext,
    ): void {
        const instance = new this();
        Action.contexts.set(instance.type, context);
    }

    /**
     * Send action to runtime (background or content script)
     */
    static async send<TPayload, TResult>(
        this: new () => Action<TPayload, TResult>,
        payload: TPayload,
    ): Promise<TResult> {
        const instance = new this();
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {type: instance.type, payload},
                (response: ActionResponse<TResult>) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.error));
                    }
                },
            );
        });
    }

    /**
     * Send action to active tab's content script
     */
    static async sendToActiveTab<TPayload, TResult>(
        this: {
            new (): Action<TPayload, TResult>;
            sendToTab(tabId: number, payload: TPayload): Promise<TResult>;
        },
        payload: TPayload,
    ): Promise<TResult> {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (!tab?.id) {
            throw new Error('No active tab found');
        }
        return this.sendToTab(tab.id, payload);
    }

    /**
     * Send action to specific tab's content script
     */
    static async sendToTab<TPayload, TResult>(
        this: new () => Action<TPayload, TResult>,
        tabId: number,
        payload: TPayload,
    ): Promise<TResult> {
        const instance = new this();
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
                tabId,
                {type: instance.type, payload},
                (response: ActionResponse<TResult>) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.error));
                    }
                },
            );
        });
    }
}

type ActionHandler<TPayload, TResult, TContext> = (
    payload: TPayload,
    sender: chrome.runtime.MessageSender,
    context: TContext,
) => TResult | Promise<TResult>;

type ActionResponse<TResult> = {success: true; data: TResult} | {success: false; error: string};
