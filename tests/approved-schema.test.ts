/**
 * approved 参数 schema 补丁的纯函数测试.
 */

import { describe, expect, test } from 'bun:test'

import { APPROVED_PARAMETER_DESCRIPTION, patchApprovedParameter } from '../src/approval/approved-schema.ts'

describe('patchApprovedParameter', () => {
  test('给 object schema 补上 boolean approved', () => {
    const parameters = { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
    expect(patchApprovedParameter(parameters)).toBe(true)
    expect(parameters.properties.approved).toEqual({
      type: 'boolean',
      description: APPROVED_PARAMETER_DESCRIPTION,
    })
    expect(parameters.required).toEqual(['command'])
  })

  test('已经是同一份字段时不再改写', () => {
    const parameters = {
      type: 'object',
      properties: {
        approved: { type: 'boolean', description: APPROVED_PARAMETER_DESCRIPTION },
      },
    }
    expect(patchApprovedParameter(parameters)).toBe(false)
  })

  test('已有非 boolean 的 approved 时不覆盖', () => {
    const parameters = {
      type: 'object',
      properties: { approved: { type: 'string' } },
    }
    expect(patchApprovedParameter(parameters)).toBe(false)
    expect(parameters.properties.approved).toEqual({ type: 'string' })
  })

  test('非对象 schema 或冻结对象时不抛错', () => {
    expect(patchApprovedParameter('nope')).toBe(false)
    expect(patchApprovedParameter({ type: 'string' })).toBe(false)
    const frozen = Object.freeze({
      type: 'object',
      properties: Object.freeze({ command: { type: 'string' } }),
    })
    expect(patchApprovedParameter(frozen)).toBe(false)
  })
})
