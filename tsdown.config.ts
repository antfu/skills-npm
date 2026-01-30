import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
  ],
  dts: true,
  exports: true,
  publint: true,
  // Bundle vendor code from submodule
  noExternal: [/vendor\/skills/],
})
