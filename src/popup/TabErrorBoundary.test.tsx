import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen} from '@testing-library/react';
import React from 'react';
import {TabErrorBoundary} from '@exo/popup/TabErrorBoundary';

// Component that throws error
const ErrorComponent = () => {
    throw new Error('Test error');
};

// Component that works
const WorkingComponent = () => {
    return React.createElement('div', null, 'Working content');
};

describe('TabErrorBoundary', () => {
    beforeEach(() => {
        // Suppress console.error for cleaner test output
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render children when no error occurs', () => {
        render(
            <TabErrorBoundary>
                <WorkingComponent />
            </TabErrorBoundary>,
        );

        expect(screen.getByText('Working content')).toBeTruthy();
    });

    it('should catch and display error when child throws', () => {
        render(
            <TabErrorBoundary>
                <ErrorComponent />
            </TabErrorBoundary>,
        );

        expect(screen.getByText('This tab failed to load')).toBeTruthy();
    });

    it('should log error details to console', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error');

        render(
            <TabErrorBoundary>
                <ErrorComponent />
            </TabErrorBoundary>,
        );

        expect(consoleErrorSpy).toHaveBeenCalled();
        // Check that our custom error logging was called
        const ourErrorCall = consoleErrorSpy.mock.calls.find(
            (call) => call[0] === 'Tab render error:',
        );
        expect(ourErrorCall).toBeTruthy();
    });

    it('should reset error state when children change', () => {
        const {rerender} = render(
            <TabErrorBoundary>
                <ErrorComponent />
            </TabErrorBoundary>,
        );

        // Verify error state
        expect(screen.getByText('This tab failed to load')).toBeTruthy();

        // Switch to working component
        rerender(
            <TabErrorBoundary>
                <WorkingComponent />
            </TabErrorBoundary>,
        );

        // Should show working content, not error
        expect(screen.getByText('Working content')).toBeTruthy();
    });
});
