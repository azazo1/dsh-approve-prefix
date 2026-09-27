/**
 * 系统提示词段的纯函数测试: 当前前缀如何列出, 以及 approved 与匹配条件是否写明.
 */

import { describe, expect, test } from 'bun:test'

import { renderAllowPrefixSection, type AllowPrefixPromptInput } from '../src/prompt/allow-prefixes.ts'

function input(overrides: Partial<AllowPrefixPromptInput> = {}): AllowPrefixPromptInput {
  return {
    tools: ['bash'],
    staticPrefixes: ['gh api'],
    persistent: [],
    temporary: [],
    allowedEscalationModes: ['danger-full-access'],
    extraDeniedCharacters: [],
    onlyEscalations: true,
    ...overrides,
  }
}

describe('renderAllowPrefixSection', () => {
  test('静态前缀对每个工具生效, 持久和临时按工具过滤', () => {
    const text = renderAllowPrefixSection(input({
      tools: ['bash', 'pwsh'],
      persistent: [{ tool: 'bash', prefix: 'git status' }],
      temporary: [{ tool: 'pwsh', prefix: 'Get-Item' }],
    }))
    expect(text).toContain('- bash:\n  - `gh api`\n  - `git status` (saved)')
    expect(text).toContain('- pwsh:\n  - `gh api`\n  - `Get-Item` (this session)')
    expect(text).toContain('parsed by local pwsh')
    expect(text).not.toContain('git status` (this session)')
  })

  test('同一前缀只保留更宽的来源', () => {
    const text = renderAllowPrefixSection(input({
      persistent: [{ tool: 'bash', prefix: ' gh api ' }],
      temporary: [{ tool: 'bash', prefix: 'gh api' }],
    }))
    expect(text).toContain('- bash:\n  - `gh api`')
    expect(text).not.toContain('`gh api` (saved)')
    expect(text).not.toContain('`gh api` (this session)')
  })

  test('没有前缀时写明 none, 并说明 approved 不命中会直接拒绝', () => {
    const text = renderAllowPrefixSection(input({ staticPrefixes: ['  '] }))
    expect(text).toContain('Untagged prefixes come from plugin config')
    expect(text).toContain('- bash:\n  - none')
    expect(text).toContain('Set true only when this command matches a prefix below')
    expect(text).toContain('rejected with no human dialog')
    expect(text).toContain('Omit it to keep the dialog')
    expect(text).toContain('one simple command')
    expect(text).toContain('/usr/bin/foo matches foo')
    expect(text).not.toContain('gh api')
    expect(text).not.toContain('/usr/bin/gh')
    expect(text).not.toContain('parsed by local pwsh')
  })

  test('非提权也应答时改写开头, 并保留档位说明', () => {
    const text = renderAllowPrefixSection(input({ onlyEscalations: false }))
    expect(text).toContain('including an ask that is not a sandbox escalation')
    expect(text).toContain('Escalation modes that qualify: danger-full-access')
    expect(text).not.toContain('a call that is not an escalation')
  })

  test('额外拒绝字符和含反引号的前缀按字面量写出', () => {
    const text = renderAllowPrefixSection(input({
      staticPrefixes: ['gh `api`'],
      extraDeniedCharacters: ['\n', '-'],
    }))
    expect(text).toContain('"gh `api`"')
    expect(text).toContain('must also not contain a newline, "-"')
  })
})
