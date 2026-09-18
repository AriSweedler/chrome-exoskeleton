import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {nextEnvironment, makeEnvCycleBinding, type EnvironmentInfo} from '@exo/lib/environments';
import {Notifications} from '@exo/lib/toast-notification';

vi.mock('@exo/lib/toast-notification', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@exo/lib/toast-notification')>();
    return {...actual, Notifications: {show: vi.fn()}};
});

const env = (name: string, current = false): EnvironmentInfo => ({
    env: name,
    url: `https://${name}.example.com/`,
    current,
});

describe('nextEnvironment', () => {
    it('returns the environment after the current one', () => {
        const envs = [env('alpha', true), env('staging'), env('production')];
        expect(nextEnvironment(envs)?.env).toBe('staging');
    });

    it('wraps around from the last environment to the first', () => {
        const envs = [env('alpha'), env('staging'), env('production', true)];
        expect(nextEnvironment(envs)?.env).toBe('alpha');
    });

    it('falls back to the first environment when none is current', () => {
        const envs = [env('alpha'), env('staging')];
        expect(nextEnvironment(envs)?.env).toBe('alpha');
    });

    it('returns undefined for undefined or empty input', () => {
        expect(nextEnvironment(undefined)).toBeUndefined();
        expect(nextEnvironment([])).toBeUndefined();
    });

    it('cycles a single environment back to itself', () => {
        const envs = [env('alpha', true)];
        expect(nextEnvironment(envs)?.env).toBe('alpha');
    });
});

describe('makeEnvCycleBinding', () => {
    const assign = vi.fn();
    const alphaThenStaging = () => [env('alpha', true), env('staging')];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('location', {href: 'https://alpha.example.com/', assign});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('binds Shift+E under the given help context', () => {
        const binding = makeEnvCycleBinding({getEnvs: alphaThenStaging, context: 'Deploys'});

        expect(binding.key).toBe('E');
        expect(binding.modifiers).toEqual({shift: true});
        expect(binding.context).toBe('Deploys');
    });

    it('is active only while the page has a next environment', () => {
        const active = makeEnvCycleBinding({getEnvs: alphaThenStaging, context: 'X'});
        const inactive = makeEnvCycleBinding({getEnvs: () => undefined, context: 'X'});

        expect(active.when?.()).toBe(true);
        expect(inactive.when?.()).toBe(false);
    });

    it('reads the URL at keypress time, navigates to the next environment, and toasts it', () => {
        const getEnvs = vi.fn(alphaThenStaging);

        makeEnvCycleBinding({getEnvs, context: 'X'}).handler();

        expect(getEnvs).toHaveBeenCalledWith('https://alpha.example.com/');
        expect(assign).toHaveBeenCalledWith('https://staging.example.com/');
        expect(Notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({message: 'Navigating to staging'}),
        );
    });

    it('toasts the custom label when one is given', () => {
        makeEnvCycleBinding({
            getEnvs: alphaThenStaging,
            context: 'X',
            label: (next) => `stack-${next.env}`,
        }).handler();

        expect(Notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({message: 'Navigating to stack-staging'}),
        );
    });

    it('does nothing when the page has no environments', () => {
        makeEnvCycleBinding({getEnvs: () => undefined, context: 'X'}).handler();

        expect(assign).not.toHaveBeenCalled();
        expect(Notifications.show).not.toHaveBeenCalled();
    });
});
