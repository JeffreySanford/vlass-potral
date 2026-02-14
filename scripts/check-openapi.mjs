import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const referencePath = resolve(
  process.cwd(),
  'documentation',
  'reference',
  'api',
  'openapi.json',
);

console.log('--- OpenAPI Regression Check ---');

if (!existsSync(referencePath)) {
  console.error(`Reference file not found at ${referencePath}`);
  process.exit(1);
}

try {
  console.log('Generating current OpenAPI spec...');
  // Use the dedicated one-shot OpenAPI target (avoid long-running serve target behavior).
  execSync('pnpm nx run cosmic-horizons-api:openapi', {
    stdio: 'inherit',
  });

  // The main.ts script writes to documentation/reference/api/openapi.json
  // To check for regression, we should have generated it to a different path or checked git status.
  // Since main.ts is already configured to overwrite the reference path,
  // we'll check if GIT sees a change.

  const diff = execSync(
    'git diff --name-only documentation/reference/api/openapi.json',
  )
    .toString()
    .trim();

  if (diff) {
    console.error('❌ OpenAPI contract regression detected!');
    console.error('Changes found in documentation/reference/api/openapi.json');
    console.error(
      'Please review the changes and commit them if they are intentional.',
    );

    // Show a snippet of the diff
    const diffContent = execSync(
      'git diff documentation/reference/api/openapi.json',
    ).toString();
    console.log(diffContent.split('\n').slice(0, 20).join('\n'));

    process.exit(1);
  } else {
    console.log('✅ OpenAPI contract is consistent.');
    process.exit(0);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to run OpenAPI check:', message);
  process.exit(1);
}
