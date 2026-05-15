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

const isWin = process.platform === 'win32'

for (const step of steps) {
  const result = spawnSync(
    isWin ? 'cmd' : step.command,
    isWin ? ['/c', step.command, ...step.args] : step.args,
    { stdio: 'inherit' },
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('[harness] all checks passed')
