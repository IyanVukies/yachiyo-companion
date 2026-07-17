import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      '.cache',
      '.venv*',
      'build',
      'out',
      'release',
      'coverage',
      'output',
      'vendor',
      'src/live2d-adapter',
      'src/renderer/public/live2d',
      'scripts/**/*.mjs',
      'eslint.config.mjs',
      'assets/source',
      'project-assets'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } }
      ]
    }
  },
  {
    files: ['src/renderer/src/global.d.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off'
    }
  }
)
