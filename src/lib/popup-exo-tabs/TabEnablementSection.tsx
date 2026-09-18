import React from 'react';
import {theme} from '@exo/theme/default';
import {useTabEnablement} from '@exo/lib/popup-exo-tabs/use-tab-enablement';

interface TabEnablementSectionProps {
    tabId: string;
}

export function TabEnablementSection({tabId}: TabEnablementSectionProps) {
    const {enabled, loading, setEnabled} = useTabEnablement(tabId);

    if (loading) {
        return null;
    }

    const handleToggle = async () => {
        await setEnabled(!enabled);
    };

    return (
        <div
            style={{
                borderTop: `1px solid ${theme.border.light}`,
                paddingTop: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}
        >
            <span>Enable on page load:</span>
            <label
                htmlFor={`enablement-checkbox-${tabId}`}
                style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}
            >
                <input
                    id={`enablement-checkbox-${tabId}`}
                    type="checkbox"
                    checked={enabled}
                    onChange={handleToggle}
                    style={{marginRight: '8px', cursor: 'pointer'}}
                />
                <span>{enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
        </div>
    );
}
