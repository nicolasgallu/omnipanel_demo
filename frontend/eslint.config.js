// ESLint (flat config) — guardián de React Hooks.
//
// Objetivo puntual: que el build FALLE cuando una función memoizada
// (useCallback/useMemo) o un efecto use un valor que no está en su lista de
// dependencias — el bug de la "fotocopia vieja" que atrasaba el precio de
// Tienda Nube. No habilita el resto de reglas de react-hooks para no
// imponer refactors ajenos a este guardián.
import parser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]
