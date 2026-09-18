/**
 * Loader for saved real GitHub PR DOM snapshots (see src/lib/example-dom.ts).
 */

import * as path from 'path';
import {fileURLToPath} from 'url';
import {createExampleDomLoader} from '@exo/lib/example-dom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const {resolveExamplePath, listExamples, loadExampleHtml, missingExampleHint} =
    createExampleDomLoader({
        examplesDir: path.join(__dirname, 'examples'),
        repoRelativeDir: 'plugins/github-autoscroll/examples',
        sourceDescription: 'the matching GitHub PR view',
    });
