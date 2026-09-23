/**
 * 会话标识解析的单元测试.
 */

import { describe, expect, test } from 'bun:test'

import { sessionKeyOf } from '../src/prefix/session-key.ts'

describe('sessionKeyOf', () => {
  test('从 agent 视图里取会话 id', () => {
    expect(sessionKeyOf({ session: { id: 'session-1' } })).toBe('session-1')
  })

  test('结构不对或缺失时返回 undefined', () => {
    expect(sessionKeyOf(undefined)).toBeUndefined()
    expect(sessionKeyOf(null)).toBeUndefined()
    expect(sessionKeyOf('session-1')).toBeUndefined()
    expect(sessionKeyOf({})).toBeUndefined()
    expect(sessionKeyOf({ session: {} })).toBeUndefined()
    expect(sessionKeyOf({ session: { id: '' } })).toBeUndefined()
    expect(sessionKeyOf({ session: { id: 42 } })).toBeUndefined()
  })
})
