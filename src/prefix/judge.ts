/**
 * 单命令前缀判定: 判断一条 shell 命令是否属于 "单条简单命令, 且 argv 前缀命中白名单".
 *
 * 判定分两层. 第一层是结构元字符的整串扫描, 命中管道, 链式, 重定向, 命令替换
 * 等任意一个字符就直接拒绝; 第二层按引号规则分词, 去掉命令行前缀形式的环境变量赋值
 * (以及 `env` 包装), 再做 argv 前缀匹配. 两层都通过才返回 allowed.
 *
 * 本模块只做命令解析, 不涉及任何策略或状态.
 *
 * @module dsh-approve-prefix/prefix/judge
 */

/**
 * 结构元字符: 固定拒绝, 不随配置放宽.
 *
 * 这些字符能组成第二条命令, 重定向输出或做命令替换, 属于 "一条命令" 判定的前提,
 * 因此不允许通过配置移除; 需要更严的限制用 extraDeniedCharacters 追加.
 */
export const STRUCTURAL_METACHARACTERS: readonly string[] = ['|', '&', ';', '<', '>', '`', '$', '\n', '\r']

/** 命令行前缀形式的赋值, 例如 `ENVA=aaa`. */
const ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=[\s\S]*$/

/** 一条命令的判定结果. */
export interface PrefixVerdict {
  /** 是否允许自动放行. */
  readonly allowed: boolean
  /** 判定依据的简短说明, 用于日志与人工排查. */
  readonly detail: string
}

/** 单命令检查结果. */
export interface CommandInspection {
  /** 是否是一条单命令. */
  readonly ok: boolean
  /** 去掉环境变量前缀之后的命令 token, 仅当 ok 为 true 时有意义. */
  readonly tokens: readonly string[]
  /** 是否确实去掉了命令行前缀形式的环境变量赋值. */
  readonly strippedEnvironment: boolean
  /** 判定依据的简短说明. */
  readonly detail: string
}

/** 把元字符渲染成日志里可读的名字. */
function describeCharacter(character: string): string {
  switch (character) {
    case '\n': return 'a newline'
    case '\r': return 'a carriage return'
    case ' ': return 'a space'
    default: return `"${character}"`
  }
}

/**
 * 按引号规则把命令切成 argv, 引号本身不进入 token.
 *
 * 未闭合的引号返回 undefined, 由调用方按拒绝处理.
 * @param text - 已 trim 的命令文本.
 * @returns token 数组, 或 undefined 表示引号不闭合.
 */
export function tokenizeCommand(text: string): string[] | undefined {
  const tokens: string[] = []
  let current = ''
  let started = false
  let quote: '"' | "'" | undefined
  for (const character of text) {
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined
        continue
      }
      current += character
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      started = true
      continue
    }
    if (character === ' ' || character === '\t') {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += character
    started = true
  }
  if (quote !== undefined) return undefined
  if (started) tokens.push(current)
  return tokens
}

/** 取命令词的文件名部分, 让 `/usr/bin/gh` 与 `gh` 等价. */
function commandWord(token: string): string {
  const slash = token.lastIndexOf('/')
  return slash === -1 ? token : token.slice(slash + 1)
}

/**
 * 去掉命令行前缀形式的环境变量赋值, 以及 `env` 包装, 返回真正的命令 token.
 *
 * `ENVA=aaa gh api user` 与 `env ENVA=aaa gh api user` 都归约为 `gh api user`;
 * `env` 后面带选项 (例如 `env -i`) 或整条命令只有赋值时返回 undefined, 交给调用方拒绝.
 * @param tokens - 分词结果.
 * @returns 命令 token, 或 undefined 表示这不是一条可判定的命令.
 */
function stripEnvironmentPrefixes(tokens: readonly string[]): string[] | undefined {
  let index = 0
  while (index < tokens.length && ASSIGNMENT_PATTERN.test(tokens[index] ?? '')) index += 1
  if (index >= tokens.length) return undefined
  if (commandWord(tokens[index] ?? '') === 'env') {
    let next = index + 1
    while (next < tokens.length && ASSIGNMENT_PATTERN.test(tokens[next] ?? '')) next += 1
    if (next >= tokens.length) return undefined
    if ((tokens[next] ?? '').startsWith('-')) return undefined
    index = next
  }
  return tokens.slice(index)
}

/**
 * 检查一条命令是否是单条简单命令, 通过时给出归约后的命令 token.
 * @param command - 模型给出的完整命令文本.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 与结构元字符一起参与扫描.
 * @returns 检查结果.
 */
export function inspectSingleCommand(command: string, extraDeniedCharacters: readonly string[] = []): CommandInspection {
  const text = command.trim()
  if (text === '') return { ok: false, tokens: [], strippedEnvironment: false, detail: 'the command is empty' }
  for (const character of [...STRUCTURAL_METACHARACTERS, ...extraDeniedCharacters]) {
    if (character === '') continue
    if (text.includes(character)) {
      return {
        ok: false,
        tokens: [],
        strippedEnvironment: false,
        detail: `the command contains ${describeCharacter(character)}, so it is not a single command`,
      }
    }
  }
  const tokens = tokenizeCommand(text)
  if (tokens === undefined) {
    return { ok: false, tokens: [], strippedEnvironment: false, detail: 'the command has an unbalanced quote' }
  }
  if (tokens.length === 0) return { ok: false, tokens: [], strippedEnvironment: false, detail: 'the command is empty' }
  const stripped = stripEnvironmentPrefixes(tokens)
  if (stripped === undefined) {
    return {
      ok: false,
      tokens: [],
      strippedEnvironment: false,
      detail: 'the command carries only environment assignments and no command to judge',
    }
  }
  const strippedEnvironment = stripped.length !== tokens.length
  return {
    ok: true,
    tokens: stripped,
    strippedEnvironment,
    detail: strippedEnvironment ? 'a single command (leading environment assignments ignored)' : 'a single command',
  }
}

/**
 * 判断一条命令是否命中白名单前缀, 且命令本身是单条简单命令.
 * @param command - 模型给出的完整命令文本.
 * @param prefixes - 允许的前缀表, 每项是空格分隔的命令词序列, 例如 `gh api`.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 与结构元字符一起参与扫描.
 * @returns 判定结果.
 */
export function judgeSingleCommandPrefix(
  command: string,
  prefixes: readonly string[],
  extraDeniedCharacters: readonly string[] = [],
): PrefixVerdict {
  const inspection = inspectSingleCommand(command, extraDeniedCharacters)
  if (!inspection.ok) return { allowed: false, detail: inspection.detail }
  for (const prefix of prefixes) {
    const words = prefix.trim().split(/\s+/).filter(word => word !== '')
    if (words.length === 0 || inspection.tokens.length < words.length) continue
    let matched = true
    for (let index = 0; index < words.length; index += 1) {
      const raw = inspection.tokens[index] ?? ''
      const token = index === 0 ? commandWord(raw) : raw
      if (token !== words[index]) {
        matched = false
        break
      }
    }
    if (matched) {
      const suffix = inspection.strippedEnvironment ? ' (leading environment assignments ignored)' : ''
      return { allowed: true, detail: `a single command matches the allowed prefix "${prefix.trim()}"${suffix}` }
    }
  }
  return { allowed: false, detail: 'a single command, but it matches no allowed prefix' }
}
