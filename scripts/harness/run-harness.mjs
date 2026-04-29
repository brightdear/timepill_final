import { spawnSync } from 'node:child_process'

const steps = [
  {
    label: 'TypeScript contract',
    command: 'npx',
    args: ['tsc', '--noEmit'],
  },
  {
    label: 'Harness tests',
    command: 'node',
    args: ['--test', 'tests/harness/app-contract.test.mjs'],
  },
]

for (const step of steps) {
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('[harness] all checks passed')
