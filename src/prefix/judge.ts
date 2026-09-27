/**
 * 单命令前缀判定: 判断一条 shell 命令是否属于 "单条简单命令, 且 argv 前缀命中白名单".
 *
 * 判定用 unbash 解析成 AST, 再按白名单检查: 必须恰好一条简单命令, 不能有管道,
 * 链式, 子 shell, 后台, 重定向, 以及会改写或执行其它命令的词展开. 通过后再去掉
 * 命令行前缀形式的环境变量赋值 (以及 `env` 包装), 做 argv 前缀匹配.
 *
 * 本模块只做命令解析, 不涉及任何策略或状态.
 *
 * @module dsh-approve-prefix/prefix/judge
 */

import { parse, type Word, type WordPart } from 'unbash'

/** 命令行前缀形式的赋值, 例如 `ENVA=aaa`. */
const ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=[\s\S]*$/

/** 会改写参数或另起命令的词展开, 一律拒绝. */
const UNSAFE_WORD_PARTS = new Set([
  'SimpleExpansion',
  'ParameterExpansion',
  'CommandExpansion',
  'ArithmeticExpansion',
  'ProcessSubstitution',
])

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

/** 把额外拒绝字符渲染成日志里可读的名字. */
function describeCharacter(character: string): string {
  switch (character) {
    case '\n': return 'a newline'
    case '\r': return 'a carriage return'
    case ' ': return 'a space'
    default: return `"${character}"`
  }
}

/** 把 AST 节点类型写成判定说明. */
function describeNodeType(type: string): string {
  switch (type) {
    case 'Pipeline': return 'a pipeline'
    case 'AndOr': return 'an and-or list'
    case 'Subshell': return 'a subshell'
    case 'BraceGroup': return 'a brace group'
    case 'CommandExpansion': return 'a command substitution'
    case 'ProcessSubstitution': return 'a process substitution'
    case 'ArithmeticExpansion': return 'an arithmetic expansion'
    case 'SimpleExpansion':
    case 'ParameterExpansion': return 'a parameter expansion'
    default: return type
  }
}

function fail(detail: string): CommandInspection {
  return { ok: false, tokens: [], strippedEnvironment: false, detail }
}

/** 取命令词的文件名部分, 让 `/usr/bin/gh` 与 `gh` 等价. */
function commandWord(token: string): string {
  const slash = token.lastIndexOf('/')
  return slash === -1 ? token : token.slice(slash + 1)
}

/**
 * 递归检查词展开. 单引号, ANSI-C 引号和字面量视为数据; 双引号内若再出现
 * 参数 / 命令 / 算术 / 进程替换则拒绝.
 */
function inspectPart(part: WordPart): string | undefined {
  if (UNSAFE_WORD_PARTS.has(part.type)) return part.type
  if (part.type === 'DoubleQuoted' || part.type === 'LocaleString') {
    for (const child of part.parts) {
      const hit = inspectPart(child)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (part.type === 'ExtendedGlob' || part.type === 'BraceExpansion') {
    for (const child of part.parts ?? []) {
      const hit = inspectPart(child)
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

/** 检查一个 Word 的 parts. */
function inspectWord(word: Word | undefined): string | undefined {
  if (word === undefined) return undefined
  for (const part of word.parts ?? []) {
    const hit = inspectPart(part)
    if (hit !== undefined) return hit
  }
  return undefined
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
 * @param extraDeniedCharacters - 额外拒绝的单字符, 对命令原文做整串扫描.
 * @returns 检查结果.
 */
export function inspectSingleCommand(command: string, extraDeniedCharacters: readonly string[] = []): CommandInspection {
  const text = command.trim()
  if (text === '') return fail('the command is empty')
  for (const character of extraDeniedCharacters) {
    if (character === '') continue
    if (text.includes(character)) {
      return fail(`the command contains ${describeCharacter(character)}, so it is not a single command`)
    }
  }

  let script
  try {
    script = parse(text)
  } catch {
    return fail('the command could not be parsed')
  }
  const firstError = script.errors?.[0]
  if (firstError !== undefined) {
    return fail(`the command could not be parsed: ${firstError.message}`)
  }
  if (script.commands.length === 0) return fail('the command is empty')
  if (script.commands.length !== 1) return fail('the command contains multiple statements')

  const statement = script.commands[0]
  if (statement === undefined) return fail('the command is empty')
  if (statement.background === true) return fail('the command runs in the background')
  if (statement.redirects.length > 0) return fail('the command contains a redirect')
  if (statement.command.type !== 'Command') {
    return fail(`the command is ${describeNodeType(statement.command.type)}`)
  }

  const simple = statement.command
  if (simple.redirects.length > 0) return fail('the command contains a redirect')
  if (simple.name === undefined) {
    return fail('the command carries only environment assignments and no command to judge')
  }

  const words: Word[] = [simple.name, ...simple.suffix]
  for (const assignment of simple.prefix) {
    const hit = inspectWord(assignment.value)
    if (hit !== undefined) return fail(`the command contains ${describeNodeType(hit)}`)
  }
  for (const word of words) {
    const hit = inspectWord(word)
    if (hit !== undefined) return fail(`the command contains ${describeNodeType(hit)}`)
  }

  const tokens = [simple.name.value, ...simple.suffix.map(word => word.value)]
  const stripped = stripEnvironmentPrefixes(tokens)
  if (stripped === undefined) {
    return fail('the command carries only environment assignments and no command to judge')
  }
  const strippedEnvironment = simple.prefix.length > 0 || stripped.length !== tokens.length
  return {
    ok: true,
    tokens: stripped,
    strippedEnvironment,
    detail: strippedEnvironment ? 'a single command (leading environment assignments ignored)' : 'a single command',
  }
}

/**
 * 按引号与 bash 词法给出 argv; 不是单条简单命令时返回 undefined.
 * @param text - 命令文本.
 * @returns token 数组, 或 undefined.
 */
export function tokenizeCommand(text: string): string[] | undefined {
  const inspection = inspectSingleCommand(text)
  if (!inspection.ok) return undefined
  return [...inspection.tokens]
}

/**
 * 判断一条命令是否命中白名单前缀, 且命令本身是单条简单命令.
 * @param command - 模型给出的完整命令文本.
 * @param prefixes - 允许的前缀表, 每项是空格分隔的命令词序列, 例如 `gh api`.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 对命令原文做整串扫描.
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
