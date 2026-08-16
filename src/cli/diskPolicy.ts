import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SharePolicy } from '../domain/policy.ts'
import type { PolicyIo } from './cliMain.ts'
import { loadPolicyText, policyFilePath, savePolicyText } from './policyStore.ts'

export function diskPolicy(env: NodeJS.ProcessEnv): PolicyIo {
  const path = policyFilePath(env)
  return {
    read: () => {
      try {
        // Stryker disable next-line StringLiteral: equivalent — Node treats "" as Buffer and JSON.parse accepts that UTF-8 Buffer
        return loadPolicyText(readFileSync(path, 'utf8'))
      } catch {
        return loadPolicyText(undefined)
      }
    },
    write: (policy: SharePolicy) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, savePolicyText(policy))
    },
  }
}
