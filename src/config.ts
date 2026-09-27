/**
 * 插件配置的默认值与校验.
 *
 * 非法配置在这里直接抛错, 让插件加载失败, 而不是静默降级成放行.
 *
 * @module dsh-approve-prefix/config
 */

import { DEFAULT_NIGHT_BLOCKED_TOOLS, DEFAULT_NIGHT_EXEMPT_TOOLS } from './night/blocked.js'

/** 默认允许自动放行的命令前缀. */
export const DEFAULT_PREFIXES: readonly string[] = []

/** 默认纳入记录与判定的工具名. */
export const DEFAULT_TOOLS: readonly string[] = ['bash', 'pwsh']

/** 默认允许自动放行的提权目标档位. */
export const DEFAULT_ESCALATION_MODES: readonly string[] = ['danger-full-access']

/** dsh 的沙箱档位词表. */
export const SANDBOX_MODES: readonly string[] = ['read-only', 'workspace-write', 'danger-full-access']

/** 默认的命令记录表容量. */
export const DEFAULT_PENDING_CAPACITY = 128

/** 默认的会话级临时前缀条数上限. */
export const DEFAULT_TEMPORARY_PREFIX_LIMIT = 32

/**
 * 默认在打开 night 时交给 agent 的上下文.
 *
 * 这段是给 "刚刚被打开" 那一刻用的, 说明用户已经离开, 以及宿主接下来会怎么拦;
 * 持续生效的完整规则由系统提示词段负责.
 */
export const DEFAULT_NIGHT_CONTEXT
  = 'The user just turned on night mode for this session and has left. Decide everything yourself, '
    + 'state your assumptions, and do not wait for an answer. Interactive tools are rejected while night mode is on, '
    + 'and only a sandbox escalation matching an allow prefix is approved without asking.'

/** 校验后的插件配置. */
export interface PluginConfig {
  /** 配置文件里的静态前缀表, 每项为空格分隔的命令词序列. */
  readonly prefixes: readonly string[]
  /** 参与记录与判定的工具名. */
  readonly tools: readonly string[]
  /** 允许自动放行的提权目标档位. */
  readonly allowedEscalationModes: readonly string[]
  /** 在 AST 判定之外额外拒绝的单字符, 对命令原文做整串扫描. */
  readonly extraDeniedCharacters: readonly string[]
  /** 为 false 时, 非提权来源的审批请求也按同一套命令规则应答. */
  readonly onlyEscalations: boolean
  /** 每个会话的临时前缀条数上限. UI 写入达到上限时拒绝新增; 判定侧 learn 仍会淘汰最旧一条. */
  readonly temporaryPrefixLimit: number
  /** 为 true 时输出判定细节日志. */
  readonly debug: boolean
  /** 命令记录表的容量上限. */
  readonly pendingCapacity: number
  /** night 期间直接拒绝的工具名. */
  readonly nightBlockedTools: readonly string[]
  /** 即使出现在被拦名单里也放行的工具名. */
  readonly nightExemptTools: readonly string[]
  /** 是否注册 `/night` 斜杠命令, 让命令行也能切换. */
  readonly nightCommand: boolean
  /** 打开 night 时交给 agent 的上下文文本; 空串表示只写状态, 不额外注入. */
  readonly nightContext: string
}

/** 已被识别的配置键, 其余键视为配置错误. */
const KNOWN_KEYS: readonly string[] = [
  'prefixes',
  'tools',
  'allowedEscalationModes',
  'extraDeniedCharacters',
  'onlyEscalations',
  'temporaryPrefixLimit',
  'debug',
  'pendingCapacity',
  'persistentPrefixes',
  'nightBlockedTools',
  'nightExemptTools',
  'nightCommand',
  'nightContext',
]

/** 判断一个值是否是普通对象. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取一个字符串数组字段. */
function readStringArray(
  raw: Record<string, unknown>,
  key: string,
  fallback: readonly string[],
): string[] {
  const value = raw[key]
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value)) throw new Error(`dsh-approve-prefix: "${key}" must be an array of strings`)
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`dsh-approve-prefix: "${key}" must contain non-empty strings`)
    }
    items.push(item.trim())
  }
  return items
}

/** 读取一个布尔字段. */
function readBoolean(raw: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`dsh-approve-prefix: "${key}" must be a boolean`)
  return value
}

/** 读取一个有界整数字段. */
function readInteger(raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`dsh-approve-prefix: "${key}" must be an integer between ${min} and ${max}`)
  }
  return value
}

/**
 * 校验并补齐配置.
 * @param raw - profile 装配层传入的原始 config, 可能为 undefined.
 * @returns 补齐默认值后的配置.
 */
export function normalizeConfig(raw: unknown): PluginConfig {
  if (raw === undefined || raw === null) raw = {}
  if (!isRecord(raw)) throw new Error('dsh-approve-prefix: config must be a mapping')
  const unknown = Object.keys(raw).filter(key => !KNOWN_KEYS.includes(key))
  if (unknown.length > 0) {
    throw new Error(`dsh-approve-prefix: unknown config key(s): ${unknown.join(', ')}; known keys: ${KNOWN_KEYS.join(', ')}`)
  }
  const allowedEscalationModes = readStringArray(raw, 'allowedEscalationModes', DEFAULT_ESCALATION_MODES)
  if (allowedEscalationModes.length === 0) {
    throw new Error('dsh-approve-prefix: "allowedEscalationModes" must not be empty')
  }
  for (const mode of allowedEscalationModes) {
    if (!SANDBOX_MODES.includes(mode)) {
      throw new Error(`dsh-approve-prefix: "allowedEscalationModes" contains unknown mode "${mode}"; expected one of ${SANDBOX_MODES.join(', ')}`)
    }
  }
  const tools = readStringArray(raw, 'tools', DEFAULT_TOOLS)
  if (tools.length === 0) throw new Error('dsh-approve-prefix: "tools" must not be empty')
  const extraDeniedCharacters = readStringArray(raw, 'extraDeniedCharacters', [])
  for (const character of extraDeniedCharacters) {
    if ([...character].length !== 1) {
      throw new Error(`dsh-approve-prefix: "extraDeniedCharacters" accepts single characters, got "${character}"`)
    }
  }
  return {
    prefixes: readStringArray(raw, 'prefixes', DEFAULT_PREFIXES),
    tools,
    allowedEscalationModes,
    extraDeniedCharacters,
    onlyEscalations: readBoolean(raw, 'onlyEscalations', true),
    temporaryPrefixLimit: readInteger(raw, 'temporaryPrefixLimit', DEFAULT_TEMPORARY_PREFIX_LIMIT, 1, 1024),
    debug: readBoolean(raw, 'debug', false),
    pendingCapacity: readInteger(raw, 'pendingCapacity', DEFAULT_PENDING_CAPACITY, 1, 4096),
    nightBlockedTools: readStringArray(raw, 'nightBlockedTools', DEFAULT_NIGHT_BLOCKED_TOOLS),
    nightExemptTools: readStringArray(raw, 'nightExemptTools', DEFAULT_NIGHT_EXEMPT_TOOLS),
    nightCommand: readBoolean(raw, 'nightCommand', true),
    nightContext: readText(raw, 'nightContext', DEFAULT_NIGHT_CONTEXT),
  }
}

/** 读取一个可空的字符串字段. 与数组字段不同, 空串是合法取值, 表示 "不注入". */
function readText(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new Error(`dsh-approve-prefix: "${key}" must be a string`)
  return value
}

/**
 * 配置里的工具名里, 挑出注册表里确实存在的那些.
 *
 * 查不到注册表时原样返回, 避免提示词在工具服务还没就绪时变成空表.
 * 一个都没注册时也退回原表, 让模型仍能看到匹配规则.
 * @param configured - config.tools.
 * @param lookup - 按名取工具; 没有注册表时省略.
 * @returns 要展示或当作默认工具的名字, 保持配置顺序.
 */
export function presentToolNames(
  configured: readonly string[],
  lookup?: (name: string) => unknown,
): readonly string[] {
  if (lookup === undefined) return configured
  const present = configured.filter(name => lookup(name) !== undefined)
  return present.length > 0 ? present : configured
}
