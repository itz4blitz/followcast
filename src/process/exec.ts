import type { HyprlandExec } from '../hyprland/port.ts'

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void

export type ExecFileFn = (
  command: string,
  args: readonly string[],
  options: { encoding: 'utf8' },
  callback: ExecFileCallback,
) => void

export function createExecFile(run: ExecFileFn): HyprlandExec {
  return (argv) =>
    new Promise((resolve, reject) => {
      const command = argv[0]
      if (command === undefined) {
        reject(new Error('empty argv'))
        return
      }
      run(command, argv.slice(1), { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(stderr === '' ? error.message : stderr))
          return
        }
        resolve(stdout)
      })
    })
}
