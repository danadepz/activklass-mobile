import { defineConfig } from 'vitest/config'

/**
 * Logic tests. The other half of the split described in jest.config.js.
 *
 * `include` is narrow on purpose. Vitest's default picks up every *.test.*
 * under the project, which would sweep in the `.screen.test.tsx` files jest
 * owns -- and those need the jest-expo transform and React Native's mocks,
 * neither of which exists here. They fail with errors that point at the
 * transform rather than at the boundary, which is a bad half-hour for whoever
 * hits it first.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.screen.test.tsx'],
  },
})
