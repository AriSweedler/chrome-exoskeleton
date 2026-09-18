import {useState, useEffect, type ComponentType, type FC} from 'react';
import {NotificationType} from '@exo/lib/toast-notification';
import type {ShowToastPayload} from '@exo/lib/actions/show-toast.action';
import {navigateAndToast} from '@exo/lib/service-worker/navigate-with-toast';
import {theme} from '@exo/theme/default';
import type {EnvironmentInfo} from '@exo/lib/environments';

/** A popup tab body: the environment-switch button row above `Inner`, if any. */
export function withEnvRow(
    getEnvs: (url: string) => EnvironmentInfo[] | undefined,
    Inner?: ComponentType,
): FC {
    return function EnvRowTab() {
        const envs = useEnvironments(getEnvs);
        return (
            <>
                {envs && <EnvButtonRow envs={envs} />}
                {Inner && <Inner />}
            </>
        );
    };
}

export function makeEnvToast(envName: string): ShowToastPayload {
    return {
        message: `Navigating to ${envName}`,
        type: NotificationType.Success,
        duration: 2000,
    };
}

export async function navigateToEnv(url: string, envName: string): Promise<void> {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) return;
    await navigateAndToast(tab.id, url, makeEnvToast(envName));
}

const STYLE = {
    current: {
        bg: theme.envButton.fallbackBg,
        hoverBg: theme.envButton.fallbackBg,
        cursor: 'default' as const,
        opacity: 0.5,
    },
    other: {
        bg: theme.envButton.specializedBg,
        hoverBg: theme.envButton.specializedHoverBg,
        cursor: 'pointer' as const,
        opacity: 1,
    },
};

export function EnvButton({info}: {info: EnvironmentInfo}) {
    const s = info.current ? STYLE.current : STYLE.other;

    return (
        <button
            disabled={info.current}
            onClick={() => navigateToEnv(info.url, info.env)}
            onMouseEnter={(e) => {
                if (!info.current) e.currentTarget.style.backgroundColor = s.hoverBg;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = s.bg;
            }}
            style={{
                flex: 1,
                padding: '10px 8px',
                fontSize: '14px',
                fontWeight: 'bold',
                border: `1px solid ${theme.envButton.border}`,
                borderRadius: '4px',
                backgroundColor: s.bg,
                color: theme.text.white,
                cursor: s.cursor,
                opacity: s.opacity,
                transition: 'all 0.15s ease',
            }}
        >
            {info.env}
        </button>
    );
}

export function EnvButtonRow({envs}: {envs: EnvironmentInfo[]}) {
    return (
        <div style={{padding: '16px', display: 'flex', gap: '8px'}}>
            {envs.map((info) => (
                <EnvButton key={info.env} info={info} />
            ))}
        </div>
    );
}

export function useEnvironments(
    getEnvs: (url: string) => EnvironmentInfo[] | undefined,
): EnvironmentInfo[] | undefined {
    const [envs, setEnvs] = useState<EnvironmentInfo[] | undefined>();

    useEffect(() => {
        const refresh = () => {
            chrome.tabs.query({active: true, currentWindow: true}, ([tab]) => {
                if (tab?.url) setEnvs(getEnvs(tab.url));
            });
        };
        refresh();

        const onUpdated = (_tabId: number, info: chrome.tabs.TabChangeInfo) => {
            if (info.url) refresh();
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        return () => chrome.tabs.onUpdated.removeListener(onUpdated);
    }, [getEnvs]);

    return envs;
}
