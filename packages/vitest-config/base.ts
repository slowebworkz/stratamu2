import tsconfigPaths from 'vite-tsconfig-paths'
import type { ViteUserConfig } from 'vitest/config'
import { defineConfig, mergeConfig } from 'vitest/config'

/**
 * Base Vitest configuration for packages in the monorepo.
 * Provides TypeScript path alias support and sensible defaults.
 */
const BASE_CONFIG = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    // Include common test patterns
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Exclude build artifacts and dependencies
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
})

/**
 * Creates a Vitest configuration by merging the base config with package-specific overrides.
 *
 * @param overrides - Package-specific configuration overrides
 * @returns Merged Vitest configuration
 *
 * @example
 * ```typescript
 * import { createVitestConfig } from '@repo/vitest-config'
 *
 * export default createVitestConfig({
 *   test: {
 *     coverage: { enabled: true }
 *   }
 * })
 * ```
 */
export function createVitestConfig(overrides: Partial<ViteUserConfig> = {}) {
  return mergeConfig(BASE_CONFIG, defineConfig(overrides))
}

// Export base config as default for backward compatibility
export default BASE_CONFIG
