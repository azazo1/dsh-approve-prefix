/**
 * night 系统提示词段的单元测试.
 */

import { describe, expect, test } from 'bun:test'

import { effectiveBlockedTools, isNightBlocked } from '../src/night/blocked.ts'
import {
  NIGHT_SECTION_NAME,
  NIGHT_SECTION_ORDER,
  renderNightSection,
} from '../src/prompt/night-mode.ts'

const BASE = {
  on: true,
  blockedTools: ['ask_user_question'],
  exemptTools: ['exit_plan_mode'],
  allowedEscalationModes: ['danger-full-access'],
}

describe('renderNightSection', () => {
  test('关掉时是空串, 段名与次序固定', () => {
    expect(renderNightSection({ ...BASE, on: false })).toBe('')
    expect(NIGHT_SECTION_NAME).toBe('approve-prefix:night')
    expect(NIGHT_SECTION_ORDER).toBeGreaterThan(10300)
  })

  test('列出被拦工具, 免拦工具与放行档位', () => {
    const other = renderNightSection({
      ...BASE,
      blockedTools: ['ask_user_question', 'exit_plan_mode'],
    })
    expect(other).toContain('ask_user_question')
    expect(other).toContain('exit_plan_mode')
    expect(other).toContain('stays available')
  })

  test('免拦名单里的工具不重复出现在被拦清单', () => {
    const text = renderNightSection(BASE)
    expect(text).toContain('ask_user_question')
    expect(text).not.toContain('exit_plan_mode')
  })

  test('没有配置任何被拦工具时明确写出来', () => {
    const text = renderNightSection({ ...BASE, blockedTools: [] })
    expect(text).toContain('No tool is blocked by night mode right now.')
  })

  test('档位为空时写 none', () => {
    expect(renderNightSection({ ...BASE, allowedEscalationModes: [] })).toContain('auto-approved: none')
  })

  test('说明开关只存内存, 并写清其余提权直接拒绝', () => {
    const text = renderNightSection(BASE)
    expect(text).toContain('rejected immediately with no prompt')
    expect(text).toContain('disappears when the harness restarts')
  })
})

describe('isNightBlocked 与 effectiveBlockedTools', () => {
  test('只认形状像工具名的条目', () => {
    expect(isNightBlocked('ask_user_question', ['ask_user_question'], [])).toBe(true)
    expect(isNightBlocked('ask_user_question', ['ask user'], [])).toBe(false)
    expect(isNightBlocked('ask_user_question', ['  '], [])).toBe(false)
  })

  test('免拦条目不出现在生效名单里', () => {
    expect(effectiveBlockedTools(['a', 'b'], ['b'])).toEqual(['a'])
    expect(effectiveBlockedTools(['a', 'a', 'c'], [])).toEqual(['a', 'c'])
    expect(effectiveBlockedTools(['bad name'], [])).toEqual([])
  })
})
