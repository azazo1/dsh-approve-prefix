/**
 * 把当前放行前缀和匹配规则写成系统提示词的一段.
 *
 * 文本在每次组装时现算: 静态前缀来自配置, 持久前缀来自 settings, 临时前缀只取
 * 当前会话. 模型看到的是此刻会自动放行的前缀, 不是启动时的快照.
 * 段放在系统提示词尾部, 前缀变化只改尾部 token.
 *
 * @module dsh-approve-prefix/prompt/allow-prefixes
 */

import type { PrefixEntry } from '../prefix/entry.js'

/** 系统提示词段名. */
export const ALLOW_PREFIX_SECTION_NAME = 'approve-prefix:allow-prefixes'

/**
 * 段顺序.
 *
 * 第一方 persona 后缀是 10200. 放在它后面, 前缀表变化不会改写前面的稳定前缀.
 */
export const ALLOW_PREFIX_SECTION_ORDER = 10300

/** 渲染一段系统提示词所需的当前放行状态. */
export interface AllowPrefixPromptInput {
  /** 参与判定的工具名. */
  readonly tools: readonly string[]
  /** 配置里的静态前缀, 对每个配置工具都生效. */
  readonly staticPrefixes: readonly string[]
  /** 持久前缀, 按工具名过滤. */
  readonly persistent: readonly PrefixEntry[]
  /** 当前会话的临时前缀, 按工具名过滤. 没有会话时为空. */
  readonly temporary: readonly PrefixEntry[]
  /** 允许自动放行的提权档位. */
  readonly allowedEscalationModes: readonly string[]
  /** 额外拒绝字符, 对命令原文整串扫描. */
  readonly extraDeniedCharacters: readonly string[]
  /** 为 false 时, 非提权审批也走同一套规则. */
  readonly onlyEscalations: boolean
}

/** 一条展示用前缀及其来源. 来源只用于去重时保留更宽的那条. */
interface ShownPrefix {
  readonly text: string
  readonly origin: 'static' | 'saved' | 'session'
}

/**
 * 收成判定器实际比较的词序列.
 *
 * 判定按空白切词, 所以 `gh  api` 与 `gh api` 是同一条前缀. 空串不参与匹配, 也不展示.
 */
function normalizePrefix(prefix: string): string | undefined {
  const words = prefix.trim().split(/\s+/).filter(word => word !== '')
  if (words.length === 0) return undefined
  return words.join(' ')
}

/** 前缀里有反引号或换行时用 JSON 字符串, 避免打断提示词. */
function quotePrefix(prefix: string): string {
  if (/[`\r\n]/.test(prefix)) return JSON.stringify(prefix)
  return `\`${prefix}\``
}

/** 工具名里有换行时用 JSON 字符串, 避免一条前缀被拆成两行. */
function quoteTool(tool: string): string {
  return /[\r\n]/.test(tool) ? JSON.stringify(tool) : tool
}

/** 把额外拒绝字符写成模型能读的名字. */
function describeCharacter(character: string): string {
  switch (character) {
    case '\n': return 'a newline'
    case '\r': return 'a carriage return'
    case ' ': return 'a space'
    default: return JSON.stringify(character)
  }
}

/**
 * 收集某个工具此刻生效的前缀.
 *
 * 静态优先于持久, 持久优先于本会话. 同一前缀只出现一次, 保留更宽的来源.
 * @param input - 当前放行状态.
 * @param tool - 工具名.
 * @returns 展示用前缀, 按来源顺序.
 */
function collectForTool(input: AllowPrefixPromptInput, tool: string): ShownPrefix[] {
  const seen = new Set<string>()
  const shown: ShownPrefix[] = []
  const push = (prefix: string, origin: ShownPrefix['origin']): void => {
    const text = normalizePrefix(prefix)
    if (text === undefined || seen.has(text)) return
    seen.add(text)
    shown.push({ text, origin })
  }
  for (const prefix of input.staticPrefixes) push(prefix, 'static')
  for (const entry of input.persistent) {
    if (entry.tool === tool) push(entry.prefix, 'saved')
  }
  for (const entry of input.temporary) {
    if (entry.tool === tool) push(entry.prefix, 'session')
  }
  return shown
}

/** 把一个工具的前缀渲染成缩进列表. */
function formatShown(shown: readonly ShownPrefix[]): string {
  if (shown.length === 0) return '  - none'
  return shown.map((entry) => {
    const quoted = quotePrefix(entry.text)
    if (entry.origin === 'saved') return `  - ${quoted} (saved)`
    if (entry.origin === 'session') return `  - ${quoted} (this session)`
    return `  - ${quoted}`
  }).join('\n')
}

/** 配置里是否有走 pwsh 解析的工具. */
function usesPwsh(tools: readonly string[]): boolean {
  return tools.some(tool => tool === 'pwsh' || tool === 'powershell')
}

/**
 * 渲染系统提示词段.
 *
 * 文案用英文, 与 bash / pwsh 参数 schema 以及宿主系统提示词一致.
 * @param input - 当前放行状态.
 * @returns 段文本. 调用方应关闭变量插值, 前缀里可能出现花括号.
 */
export function renderAllowPrefixSection(input: AllowPrefixPromptInput): string {
  const modes = input.allowedEscalationModes.length === 0
    ? 'none'
    : input.allowedEscalationModes.join(', ')
  const intro = input.onlyEscalations
    ? `A sandbox escalation to ${modes} on a configured shell tool is auto-approved once when the command matches an allow prefix for that tool.`
    : `An approval ask on a configured shell tool is auto-approved once when the command matches an allow prefix for that tool, including an ask that is not a sandbox escalation. Escalation modes that qualify: ${modes}.`
  const caveat = input.onlyEscalations
    ? 'A wrong escalation mode, a call that is not an escalation, or a command this plugin did not record still goes to a human even when approved is true.'
    : 'A wrong escalation mode, or a command this plugin did not record, still goes to a human even when approved is true.'

  const lines = [
    'Allow prefixes',
    '',
    intro,
    '',
    'Match: one simple command whose argv starts with a prefix listed for that tool below. A pipe, &&, ||, ;, redirect, background job, subshell, or command / parameter substitution does not match. A prefix is space-separated words; later arguments may follow. The first word matches by filename, so /usr/bin/gh matches gh. Leading NAME=value assignments and a bare env wrapper are ignored. env with options is not.',
  ]
  const extra = input.extraDeniedCharacters.filter(character => character !== '').map(describeCharacter)
  if (extra.length > 0) lines.push(`The command text must also not contain ${extra.join(', ')}.`)
  if (usesPwsh(input.tools)) {
    lines.push('pwsh and powershell are parsed by local pwsh. A missing parser does not match.')
  }
  lines.push(
    '',
    'approved: optional boolean on the tool call. Set true only when this command matches a prefix below. If true and the prefix misses, the call is rejected with no human dialog. Omit it to keep the dialog. A real match is auto-approved either way. '
      + caveat,
    '',
    'Currently allowed prefixes:',
    'Untagged prefixes come from plugin config and apply to every session. (saved) is stored in settings. (this session) applies only to this session.',
  )
  if (input.tools.length === 0) {
    lines.push('- (no configured tool)')
  } else {
    for (const tool of input.tools) {
      lines.push(`- ${quoteTool(tool)}:`, formatShown(collectForTool(input, tool)))
    }
  }
  return lines.join('\n')
}
