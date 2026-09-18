import {describe, it, expect, beforeEach, vi} from 'vitest';
import {Action} from '@exo/lib/actions/base-action';
import chrome from 'sinon-chrome';

// Test action classes
class TestAction extends Action<{value: number}, {result: number}> {
    type = 'TEST_ACTION' as const;
}

class AnotherAction extends Action<string, boolean> {
    type = 'ANOTHER_ACTION' as const;
}

describe('Action', () => {
    beforeEach(() => {
        chrome.reset();
        // Clear any registered handlers between tests
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Action as any).handlers.clear();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Action as any).contexts.clear();
    });

    describe('handle', () => {
        it('should register a handler for an action type', () => {
            const handler = vi.fn(async (payload: {value: number}) => ({
                result: payload.value * 2,
            }));

            expect(() => TestAction.handle(handler)).not.toThrow();
        });

        it('should throw if handler is already registered', () => {
            const handler = vi.fn();
            TestAction.handle(handler);

            expect(() => TestAction.handle(handler)).toThrow(
                'Handler for action type "TEST_ACTION" is already registered',
            );
        });

        it('should handle incoming messages', async () => {
            const handler = vi.fn(async (payload: {value: number}) => ({
                result: payload.value * 2,
            }));

            TestAction.handle(handler);

            // Get the registered message listener
            const listener = chrome.runtime.onMessage.addListener.getCall(0).args[0];

            // Simulate incoming message
            const sendResponse = vi.fn();
            const result = listener(
                {type: 'TEST_ACTION', payload: {value: 5}},
                {tab: {id: 1}},
                sendResponse,
            );

            expect(result).toBe(true); // Should return true for async

            // Wait for async handler
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(handler).toHaveBeenCalledWith({value: 5}, {tab: {id: 1}}, undefined);
            expect(sendResponse).toHaveBeenCalledWith({
                success: true,
                data: {result: 10},
            });
        });

        it('should handle errors in handler', async () => {
            const handler = vi.fn(async () => {
                throw new Error('Handler error');
            });

            TestAction.handle(handler);

            const listener = chrome.runtime.onMessage.addListener.getCall(0).args[0];
            const sendResponse = vi.fn();

            listener({type: 'TEST_ACTION', payload: {value: 5}}, {}, sendResponse);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendResponse).toHaveBeenCalledWith({
                success: false,
                error: 'Handler error',
            });
        });

        it('should return false for unhandled message types', () => {
            const handler = vi.fn();
            TestAction.handle(handler);

            const listener = chrome.runtime.onMessage.addListener.getCall(0).args[0];
            const sendResponse = vi.fn();

            // Send message with unknown type
            const result = listener({type: 'UNKNOWN_ACTION', payload: {}}, {}, sendResponse);

            expect(result).toBe(false);
            expect(sendResponse).not.toHaveBeenCalled();
        });
    });

    describe('setContext', () => {
        it('should set context for an action', () => {
            const context = {count: 0};
            expect(() => TestAction.setContext(context)).not.toThrow();
        });

        it('should pass context to handler', async () => {
            const context = {count: 0};
            const handler = vi.fn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async (payload: {value: number}, _sender: any, ctx: {count: number}) => {
                    ctx.count += payload.value;
                    return {result: ctx.count};
                },
            );

            TestAction.setContext(context);
            TestAction.handle(handler);

            const listener = chrome.runtime.onMessage.addListener.getCall(0).args[0];
            const sendResponse = vi.fn();

            listener({type: 'TEST_ACTION', payload: {value: 5}}, {}, sendResponse);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(handler).toHaveBeenCalledWith({value: 5}, {}, context);
            expect(context.count).toBe(5);
            expect(sendResponse).toHaveBeenCalledWith({
                success: true,
                data: {result: 5},
            });
        });
    });

    describe('send', () => {
        it('should send message via chrome.runtime.sendMessage', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
            chrome.runtime.sendMessage.yields({success: true, data: {result: 10}});

            const result = await TestAction.send({value: 5});

            expect(chrome.runtime.sendMessage.calledOnce).toBe(true);
            expect(
                chrome.runtime.sendMessage.calledWith({
                    type: 'TEST_ACTION',
                    payload: {value: 5},
                }),
            ).toBe(true);
            expect(result).toEqual({result: 10});
        });

        it('should reject on chrome.runtime.lastError', async () => {
            chrome.runtime.lastError = {message: 'Connection error'};
            chrome.runtime.sendMessage.yields(undefined);

            await expect(TestAction.send({value: 5})).rejects.toThrow('Connection error');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
        });

        it('should reject on action error response', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
            chrome.runtime.sendMessage.yields({success: false, error: 'Action failed'});

            await expect(TestAction.send({value: 5})).rejects.toThrow('Action failed');
        });
    });

    describe('sendToActiveTab', () => {
        it('should query active tab and send message', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
            chrome.tabs.query.resolves([{id: 123}]);
            chrome.tabs.sendMessage.yields({success: true, data: true});

            const result = await AnotherAction.sendToActiveTab('test');

            expect(chrome.tabs.query.calledOnce).toBe(true);
            expect(chrome.tabs.query.calledWith({active: true, currentWindow: true})).toBe(true);
            expect(chrome.tabs.sendMessage.calledWith(123)).toBe(true);
            expect(result).toBe(true);
        });

        it('should throw if no active tab found', async () => {
            chrome.tabs.query.resolves([{}]);

            await expect(AnotherAction.sendToActiveTab('test')).rejects.toThrow(
                'No active tab found',
            );
        });

        it('should throw if the query returns no tabs at all', async () => {
            chrome.tabs.query.resolves([]);

            await expect(AnotherAction.sendToActiveTab('test')).rejects.toThrow(
                'No active tab found',
            );
        });
    });

    describe('sendToTab', () => {
        it('should send message to specific tab', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
            chrome.tabs.sendMessage.yields({success: true, data: true});

            const result = await AnotherAction.sendToTab(456, 'test');

            expect(chrome.tabs.sendMessage.calledOnce).toBe(true);
            expect(
                chrome.tabs.sendMessage.calledWith(456, {
                    type: 'ANOTHER_ACTION',
                    payload: 'test',
                }),
            ).toBe(true);
            expect(result).toBe(true);
        });

        it('should reject on chrome.runtime.lastError', async () => {
            chrome.runtime.lastError = {message: 'Tab not found'};
            chrome.tabs.sendMessage.yields(undefined);

            await expect(AnotherAction.sendToTab(456, 'test')).rejects.toThrow('Tab not found');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
        });

        it('should reject on action error response', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (chrome.runtime as any).lastError;
            chrome.tabs.sendMessage.yields({success: false, error: 'Action failed'});

            await expect(AnotherAction.sendToTab(456, 'test')).rejects.toThrow('Action failed');
        });
    });
});
