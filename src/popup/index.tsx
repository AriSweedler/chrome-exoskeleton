import React from 'react';
import ReactDOM from 'react-dom/client';
import {Popup} from '@exo/popup/Popup';

// Popup side of plugin discovery: every mounted plugin's tab.tsx registers itself.
import '@exo/plugins';

const root = document.getElementById('root');
if (root) {
    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <Popup />
        </React.StrictMode>,
    );
}
