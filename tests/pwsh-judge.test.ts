/**
 * pwsh 判定: 白名单读 ParseInput 摘要; 本机没有 pwsh 时 fail-closed.
 */
import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'bun:test'

import { judgeSingleCommandPrefix } from '../src/prefix/judge.ts'
import { inspectionFromPwshSummary, inspectPwshCommand, type PwshAstSummary } from '../src/prefix/pwsh-judge.ts'

const PREFIXES = ['gh api']

function summary(overrides: Partial<PwshAstSummary> = {}): PwshAstSummary {
  return {
    errors: [],
    statementCount: 1,
    statementType: 'PipelineAst',
    pipelineCount: 1,
    invocation: 'Unknown',
    redirections: 0,
    elements: [
      { type: 'StringConstantExpressionAst', value: 'gh' },
      { type: 'StringConstantExpressionAst', value: 'api' },
      { type: 'StringConstantExpressionAst', value: 'user' },
    ],
    ...overrides,
  }
}

function hasPwsh(): boolean {
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  })
  return result.error?.code !== 'ENOENT' && result.status === 0
}

describe('inspectionFromPwshSummary', () => {
  test('放行一条字面量命令', () => {
    const inspection = inspectionFromPwshSummary(summary())
    expect(inspection.ok).toBe(true)
    expect(inspection.tokens).toEqual(['gh', 'api', 'user'])
  })

  test('拒绝管道, 链式, 调用运算符, 重定向和展开', () => {
    expect(inspectionFromPwshSummary(summary({ pipelineCount: 2 })).ok).toBe(false)
    expect(inspectionFromPwshSummary(summary({ statementType: 'PipelineChainAst', pipelineCount: 0 })).ok).toBe(false)
    expect(inspectionFromPwshSummary(summary({ invocation: 'Ampersand' })).ok).toBe(false)
    expect(inspectionFromPwshSummary(summary({ redirections: 1 })).ok).toBe(false)
    expect(inspectionFromPwshSummary(summary({
      elements: [
        { type: 'StringConstantExpressionAst', value: 'gh' },
        { type: 'StringConstantExpressionAst', value: 'api' },
        { type: 'ExpandableStringExpressionAst', value: '$HOME' },
      ],
    })).ok).toBe(false)
    expect(inspectionFromPwshSummary(summary({
      elements: [
        { type: 'StringConstantExpressionAst', value: 'gh' },
        { type: 'SubExpressionAst', value: '$(Get-Date)' },
      ],
    })).ok).toBe(false)
  })

  test('拒绝解析错误与多条 statement', () => {
    expect(inspectionFromPwshSummary(summary({ errors: ['unterminated string'] })).ok).toBe(false)
    expect(inspectionFromPwshSummary(summary({ statementCount: 2 })).ok).toBe(false)
  })

  test('ConvertTo-Json 把单元素数组打成对象时仍能读', () => {
    const inspection = inspectionFromPwshSummary({
      errors: 'x' as unknown as string[],
      statementCount: 1,
      statementType: 'PipelineAst',
      pipelineCount: 1,
      invocation: 'Unknown',
      redirections: 0,
      elements: { type: 'StringConstantExpressionAst', value: 'gh' } as unknown as PwshAstSummary['elements'],
    })
    expect(inspection.ok).toBe(false)
    const ok = inspectionFromPwshSummary({
      errors: [],
      statementCount: 1,
      statementType: 'PipelineAst',
      pipelineCount: 1,
      invocation: 'Unknown',
      redirections: 0,
      elements: { type: 'StringConstantExpressionAst', value: 'gh' } as unknown as PwshAstSummary['elements'],
    })
    expect(ok.tokens).toEqual(['gh'])
  })
})

describe('inspectPwshCommand', () => {
  test('本机 pwsh 可用则解析, 否则转人工', () => {
    const inspection = inspectPwshCommand('gh api user')
    if (hasPwsh()) {
      expect(inspection.ok).toBe(true)
      expect(inspection.tokens.slice(0, 2)).toEqual(['gh', 'api'])
      expect(judgeSingleCommandPrefix('gh api user', PREFIXES, [], 'pwsh').allowed).toBe(true)
      expect(judgeSingleCommandPrefix('gh api user | ConvertTo-Json', PREFIXES, [], 'pwsh').allowed).toBe(false)
      expect(judgeSingleCommandPrefix('gh api $HOME', PREFIXES, [], 'pwsh').allowed).toBe(false)
    } else {
      expect(inspection.ok).toBe(false)
      expect(judgeSingleCommandPrefix('gh api user', PREFIXES, [], 'pwsh').allowed).toBe(false)
    }
  })
})
