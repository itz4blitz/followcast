import { describe, expect, it } from 'vitest'
import { dummySurfaceEnv } from '../../src/cli/privacyCardProcess.ts'

describe('dummySurfaceEnv', () => {
  it('forces GDK_SCALE=1 so layout stays 1280x720 CSS pixels', () => {
    const env = dummySurfaceEnv({ GDK_SCALE: '2', HOME: '/home/dev' })
    expect(env.GDK_SCALE).toBe('1')
    expect(env.GDK_DPI_SCALE).toBe('1')
    expect(env.PYTHONUNBUFFERED).toBe('1')
    expect(env.HOME).toBe('/home/dev')
  })

  it('drops undefined keys instead of writing them as the string undefined', () => {
    const env = dummySurfaceEnv({ HOME: '/home/dev', EMPTY: undefined, GDK_SCALE: '2' })
    expect(Object.hasOwn(env, 'EMPTY')).toBe(false)
    expect(env.GDK_SCALE).toBe('1')
    expect(env.HOME).toBe('/home/dev')
  })
})
