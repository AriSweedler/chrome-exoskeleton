import {afterEach, beforeEach, vi} from 'vitest';
import chrome from 'sinon-chrome';
import '@testing-library/jest-dom';

// Mock Chrome APIs globally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = chrome;

// Mock window.scrollBy for jsdom (not implemented by default)
window.scrollBy = vi.fn();

// Suppress console noise during tests (production code logs)
beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Reset mocks between tests
afterEach(() => {
    chrome.reset();
    vi.restoreAllMocks();
});
