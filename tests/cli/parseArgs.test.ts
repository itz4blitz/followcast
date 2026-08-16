import { describe, expect, it } from 'vitest'
import { parseArgs } from '../../src/cli/parseArgs.ts'

describe('parseArgs', () => {
  it('runs with default options when given no flags', () => {
    expect(parseArgs([])).toEqual({ kind: 'run', denyClasses: [] })
  })

  it('treats start as the default command', () => {
    expect(parseArgs(['start'])).toEqual({ kind: 'run', denyClasses: [] })
  })

  it('collects repeated --deny-class values', () => {
    expect(parseArgs(['--deny-class', 'zoom', '--deny-class', 'skype'])).toEqual({
      kind: 'run',
      denyClasses: ['zoom', 'skype'],
    })
  })

  it('prints help for -h and --help', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' })
    expect(parseArgs(['-h'])).toEqual({ kind: 'help' })
  })

  it('rejects --deny-class without a value', () => {
    expect(parseArgs(['--deny-class'])).toEqual({
      kind: 'error',
      message: '--deny-class requires a window class',
    })
    expect(parseArgs(['--deny-class', '--help'])).toEqual({
      kind: 'error',
      message: '--deny-class requires a window class',
    })
  })

  it('rejects unknown flags', () => {
    expect(parseArgs(['--wat'])).toEqual({
      kind: 'error',
      message: 'unknown argument: --wat',
    })
  })

  it('rejects leftover positional words', () => {
    expect(parseArgs(['start', 'now'])).toEqual({
      kind: 'error',
      message: 'unknown argument: now',
    })
  })

  it('shows policy with no extra words', () => {
    expect(parseArgs(['policy'])).toEqual({ kind: 'policy-show' })
  })

  it('sets a monitor or app switch', () => {
    expect(parseArgs(['policy', 'set-monitor', 'HDMI-A-1', 'off'])).toEqual({
      kind: 'policy-set-monitor',
      name: 'HDMI-A-1',
      enabled: false,
    })
    expect(parseArgs(['policy', 'set-app', 'slack', 'on'])).toEqual({
      kind: 'policy-set-app',
      className: 'slack',
      enabled: true,
    })
  })

  it('rejects a malformed policy mutation', () => {
    expect(parseArgs(['policy', 'set-monitor'])).toEqual({
      kind: 'error',
      message: 'usage: followcast policy set-monitor <name> on|off',
    })
    expect(parseArgs(['policy', 'set-monitor', 'DP-1'])).toEqual({
      kind: 'error',
      message: 'usage: followcast policy set-monitor <name> on|off',
    })
    expect(parseArgs(['policy', 'set-monitor', '-x', 'on'])).toEqual({
      kind: 'error',
      message: 'usage: followcast policy set-monitor <name> on|off',
    })
    expect(parseArgs(['policy', 'set-app'])).toEqual({
      kind: 'error',
      message: 'usage: followcast policy set-app <class> on|off',
    })
    expect(parseArgs(['policy', 'set-app', 'slack'])).toEqual({
      kind: 'error',
      message: 'usage: followcast policy set-app <class> on|off',
    })
    expect(parseArgs(['policy', 'set-app', '--nope', 'off'])).toEqual({
      kind: 'error',
      message: 'usage: followcast policy set-app <class> on|off',
    })
  })

  it('accepts true and false as policy switches', () => {
    expect(parseArgs(['policy', 'set-monitor', 'DP-1', 'true'])).toEqual({
      kind: 'policy-set-monitor',
      name: 'DP-1',
      enabled: true,
    })
    expect(parseArgs(['policy', 'set-app', 'slack', 'false'])).toEqual({
      kind: 'policy-set-app',
      className: 'slack',
      enabled: false,
    })
  })

  it('rejects an unknown policy subcommand', () => {
    expect(parseArgs(['policy', 'foo'])).toEqual({
      kind: 'error',
      message: 'unknown argument: foo',
    })
  })

  it('parses status', () => {
    expect(parseArgs(['status'])).toEqual({ kind: 'status' })
  })

  it('rejects leftover words after status', () => {
    expect(parseArgs(['status', 'now'])).toEqual({
      kind: 'error',
      message: 'unknown argument: now',
    })
  })
})
