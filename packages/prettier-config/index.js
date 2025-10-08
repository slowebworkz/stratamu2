export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
  proseWrap: 'always',
  quoteProps: 'as-needed',
  jsxSingleQuote: false,
  plugins: ['prettier-plugin-packagejson', 'prettier-plugin-organize-imports'],
  overrides: [
    {
      files: ['*.json', '*.yml', '*.yaml'],
      options: { tabWidth: 2 },
    },
    {
      files: '*.md',
      options: { proseWrap: 'always' },
    },
  ],
}
