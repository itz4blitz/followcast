import { describe, expect, it } from 'vitest'
import {
  GTK4_LAYER_SHELL,
  dummySurfaceEnv,
  withLayerShellPreload,
} from '../../src/cli/privacyCardProcess.ts'

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

describe('dummySurfaceEnv', () => {
  it('forces GDK_SCALE=1 so the share buffer is 1280x720 not 2560x1440', () => {
    const env = dummySurfaceEnv({ GDK_SCALE: '2', HOME: '/home/dev' })
    expect(env.GDK_SCALE).toBe('1')
    expect(env.GDK_DPI_SCALE).toBe('1')
    expect(env.HOME).toBe('/home/dev')
  })

  it('drops undefined keys instead of writing them as the string undefined', () => {
    const env = dummySurfaceEnv({ HOME: '/home/dev', EMPTY: undefined, GDK_SCALE: '2' })
    expect(Object.hasOwn(env, 'EMPTY')).toBe(false)
    expect(env.GDK_SCALE).toBe('1')
    expect(env.HOME).toBe('/home/dev')
  })
})
