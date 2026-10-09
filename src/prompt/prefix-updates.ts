/** 放行前缀变更的去重与会话上下文注入. */

import type { AgentLike } from '../host-types.js'
import type { PrefixEntry } from '../prefix/entry.js'
import { ALLOW_PREFIX_SECTION_NAME } from './allow-prefixes.js'

/**
 * 忽略顺序, 重复条目与前缀空白差异, 只比较实际的工具前缀集合.
 * @param entries - 当前前缀条目.
 * @returns 用于比较前后集合的稳定键.
 */
export function prefixEntriesKey(entries: readonly PrefixEntry[]): string {
  return JSON.stringify([...new Set(entries.map(entry => JSON.stringify([
    entry.tool,
    entry.prefix.trim().split(/\s+/).filter(Boolean).join(' '),
  ])))].sort())
}

/**
 * 把最新规则排入下一模型步骤, 不唤醒空闲 agent, 不开启新一轮对话.
 * @param agent - 接收变更的已加载 agent.
 * @param text - 与该 agent 系统提示词一致的完整前缀规则.
 * @returns 无返回值.
 */
export function injectAllowPrefixUpdate(agent: AgentLike, text: string): void {
  const id = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  agent.inject({
    id,
    role: 'user',
    content: [{
      type: 'text',
      text: 'Allow prefixes changed. This snapshot supersedes earlier allow-prefix snapshots for this session. '
        + 'Use the current prefixes below for subsequent commands. This change does not change Night mode.\n\n'
        + text,
    }],
    source: {
      kind: 'approve-prefix',
      form: 'snapshot',
      sections: [{ name: ALLOW_PREFIX_SECTION_NAME, text }],
    },
  })
}
