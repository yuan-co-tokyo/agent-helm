import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default [
  { ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', '.agtx/**', '.codex/**', '.claude/**'] },
  js.configs.recommended, ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-restricted-syntax': ['error', { selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]', message: 'Render untrusted content as text.' }],
      'no-restricted-imports': ['error', { paths: ['child_process', 'node:child_process'].map(name => ({ name, importNames: ['exec', 'execSync'], message: 'Use execFile with separate arguments.' })) }]
    } },
  { files: ['src/web/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: hooks.configs.recommended.rules },
  { files: ['src/server/**/*.ts'], rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] } }
];
