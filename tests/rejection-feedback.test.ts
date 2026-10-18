/**
 * 宿主 "拒绝即终结" 尾句的改写测试: 认领边界与主体词替换.
 */

import { describe, expect, test } from 'bun:test'

import { retryableRejection } from '../src/approval/rejection-feedback.ts'

/** 宿主的固定尾句, 由 dsh-sandbox 的 approveEscalation 给出. */
const TAIL = 'it stays denied, so stop and explain instead of working around it'

describe('宿主拒绝文案的改写', () => {
  test('只换尾句, 前缀与档位原样保留', () => {
    expect(retryableRejection(`the user rejected escalating this command to "danger-full-access"; ${TAIL}`))
      .toBe('the user rejected escalating this command to "danger-full-access"; '
        + 'if this command is still necessary, re-request it with a clearer justification, '
        + 'though a repeat ask may be rejected again')
  })

  test('主体词随工具家族变化', () => {
    expect(retryableRejection(`the user rejected escalating this operation to "workspace-write"; ${TAIL}`))
      .toBe('the user rejected escalating this operation to "workspace-write"; '
        + 'if this operation is still necessary, re-request it with a clearer justification, '
        + 'though a repeat ask may be rejected again')
  })

  test('不是这句话时一律不认领', () => {
    expect(retryableRejection('the user rejected tool "chrome_open"')).toBeUndefined()
    expect(retryableRejection('the user rejected escalating this command to "danger-full-access"; it stays denied'))
      .toBeUndefined()
    expect(retryableRejection(`Error: the user rejected escalating this command to "danger-full-access"; ${TAIL}`))
      .toBeUndefined()
    expect(retryableRejection('tool call aborted')).toBeUndefined()
  })
})
