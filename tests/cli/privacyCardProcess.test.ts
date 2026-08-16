import { describe, expect, it } from 'vitest'
import { GTK4_LAYER_SHELL, withLayerShellPreload } from '../../src/cli/privacyCardProcess.ts'

describe('withLayerShellPreload', () => {
  it('puts gtk4-layer-shell first on an empty LD_PRELOAD', () => {
    expect(withLayerShellPreload({ HOME: '/home/dev', LD_PRELOAD: undefined })).toEqual({
      HOME: '/home/dev',
      LD_PRELOAD: GTK4_LAYER_SHELL,
    })
  })

  it('keeps existing preloads after the layer-shell library', () => {
    expect(withLayerShellPreload({ LD_PRELOAD: '/opt/fake.so' })).toEqual({
      LD_PRELOAD: `${GTK4_LAYER_SHELL}:/opt/fake.so`,
    })
  })

  it('does not duplicate the layer-shell library', () => {
    expect(withLayerShellPreload({ LD_PRELOAD: `${GTK4_LAYER_SHELL}:/opt/fake.so` })).toEqual({
      LD_PRELOAD: `${GTK4_LAYER_SHELL}:/opt/fake.so`,
    })
  })
})
