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

  it('omits undefined environment values', () => {
    const env = withLayerShellPreload({
      HOME: '/home/dev',
      EMPTY: undefined,
      LD_PRELOAD: undefined,
    })
    expect(Object.hasOwn(env, 'EMPTY')).toBe(false)
    expect(Object.keys(env).sort()).toEqual(['HOME', 'LD_PRELOAD'])
    expect(env.HOME).toBe('/home/dev')
    expect(env.LD_PRELOAD).toBe(GTK4_LAYER_SHELL)
  })

  it('does not duplicate the layer-shell library', () => {
    expect(withLayerShellPreload({ LD_PRELOAD: `${GTK4_LAYER_SHELL}:/opt/fake.so` })).toEqual({
      LD_PRELOAD: `${GTK4_LAYER_SHELL}:/opt/fake.so`,
    })
  })
})
