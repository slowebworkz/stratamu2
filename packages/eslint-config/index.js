import js from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tsEslint from 'typescript-eslint'

export default tsEslint.config(
  {
    ignores: ['node_modules', '!.*', '**/dist', '**/build', 'apps/nextjs/.next']
  },

  {
    extends: [js.configs.recommended, ...tsEslint.configs.recommended],
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },

  eslintPluginPrettierRecommended
)
