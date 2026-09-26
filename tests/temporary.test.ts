/**
 * 会话级临时放行前缀表的单元测试.
 */

import { describe, expect, test } from 'bun:test'

import { TemporaryPrefixes } from '../src/prefix/temporary.ts'

const FIRST = 'session-first'
const SECOND = 'session-second'

describe('TemporaryPrefixes', () => {
  test('按会话分组, 会话之间互不可见', () => {
    const allowlist = new TemporaryPrefixes(8)
    allowlist.learn(FIRST, 'bash', 'gh api')
    allowlist.learn(SECOND, 'bash', 'npm run')
    expect(allowlist.forTool(FIRST, 'bash')).toEqual(['gh api'])
    expect(allowlist.forTool(SECOND, 'bash')).toEqual(['npm run'])
    expect(allowlist.list(FIRST)).toEqual([{ tool: 'bash', prefix: 'gh api' }])
  })

  test('按工具筛选', () => {
    const allowlist = new TemporaryPrefixes(8)
    allowlist.learn(FIRST, 'bash', 'gh api')
    allowlist.learn(FIRST, 'pwsh', 'gh api')
    expect(allowlist.forTool(FIRST, 'bash')).toEqual(['gh api'])
    expect(allowlist.forTool(FIRST, 'pwsh')).toEqual(['gh api'])
    expect(allowlist.forTool(FIRST, 'other')).toEqual([])
  })

  test('取不到会话标识时视为空表', () => {
    const allowlist = new TemporaryPrefixes(8)
    allowlist.learn(FIRST, 'bash', 'gh api')
    expect(allowlist.forTool(undefined, 'bash')).toEqual([])
    expect(allowlist.list(undefined)).toEqual([])
    expect(allowlist.forget(undefined, 'bash', 'gh api')).toBe(false)
  })

  test('重复加入同一条前缀不增加条目', () => {
    const allowlist = new TemporaryPrefixes(8)
    expect(allowlist.learn(FIRST, 'bash', 'gh api')).toBe(true)
    expect(allowlist.learn(FIRST, 'bash', 'gh api')).toBe(false)
    expect(allowlist.list(FIRST)).toHaveLength(1)
  })

  test('forget 与 clear 只影响当前会话', () => {
    const allowlist = new TemporaryPrefixes(8)
    allowlist.learn(FIRST, 'bash', 'gh api')
    allowlist.learn(SECOND, 'bash', 'gh api')
    expect(allowlist.forget(FIRST, 'bash', 'gh api')).toBe(true)
    expect(allowlist.forget(FIRST, 'bash', 'gh api')).toBe(false)
    expect(allowlist.forTool(SECOND, 'bash')).toEqual(['gh api'])
    allowlist.clear(FIRST)
    expect(allowlist.list(SECOND)).toEqual([{ tool: 'bash', prefix: 'gh api' }])
  })

  test('单会话超出容量时淘汰最早的一条', () => {
    const allowlist = new TemporaryPrefixes(2)
    allowlist.learn(FIRST, 'bash', 'gh api')
    allowlist.learn(FIRST, 'bash', 'npm run')
    allowlist.learn(FIRST, 'bash', 'cargo build')
    expect(allowlist.forTool(FIRST, 'bash')).toEqual(['npm run', 'cargo build'])
  })

  test('会话数超出上限时淘汰最早的会话', () => {
    const allowlist = new TemporaryPrefixes(4, 2)
    allowlist.learn(FIRST, 'bash', 'gh api')
    allowlist.learn(SECOND, 'bash', 'gh api')
    allowlist.learn('session-third', 'bash', 'gh api')
    expect(allowlist.forTool(FIRST, 'bash')).toEqual([])
    expect(allowlist.forTool(SECOND, 'bash')).toEqual(['gh api'])
    expect(allowlist.forTool('session-third', 'bash')).toEqual(['gh api'])
  })

  test('replace 整表写入并保序', () => {
    const allowlist = new TemporaryPrefixes(8)
    expect(allowlist.replace(FIRST, [
      { tool: 'bash', prefix: 'npm run' },
      { tool: 'pwsh', prefix: 'gh api' },
    ])).toBeUndefined()
    expect(allowlist.list(FIRST)).toEqual([
      { tool: 'bash', prefix: 'npm run' },
      { tool: 'pwsh', prefix: 'gh api' },
    ])
  })

  test('replace 校验失败或超限时不改表', () => {
    const allowlist = new TemporaryPrefixes(1)
    allowlist.learn(FIRST, 'bash', 'gh api')
    expect(allowlist.replace(FIRST, [{ tool: 'bash', prefix: 'gh api | jq' }])).toBe('operator')
    expect(allowlist.replace(FIRST, [{ tool: '', prefix: 'gh api' }])).toBe('empty-tool')
    expect(allowlist.replace(FIRST, [
      { tool: 'bash', prefix: 'gh api' },
      { tool: 'bash', prefix: 'npm run' },
    ])).toBe('limit')
    expect(allowlist.list(FIRST)).toEqual([{ tool: 'bash', prefix: 'gh api' }])
  })

  test('replace 重复条目不改表', () => {
    const allowlist = new TemporaryPrefixes(8)
    allowlist.learn(FIRST, 'bash', 'keep')
    expect(allowlist.replace(FIRST, [
      { tool: 'bash', prefix: 'gh api' },
      { tool: 'bash', prefix: 'gh api' },
    ])).toBe('duplicate')
    expect(allowlist.list(FIRST)).toEqual([{ tool: 'bash', prefix: 'keep' }])
  })

  test('replace 空表清空当前会话', () => {
    const allowlist = new TemporaryPrefixes(8)
    allowlist.learn(FIRST, 'bash', 'gh api')
    allowlist.learn(SECOND, 'bash', 'npm run')
    expect(allowlist.replace(FIRST, [])).toBeUndefined()
    expect(allowlist.list(FIRST)).toEqual([])
    expect(allowlist.list(SECOND)).toEqual([{ tool: 'bash', prefix: 'npm run' }])
  })
})
