/**
 * 单命令前缀判定: 判断一条 shell 命令是否属于 "单条简单命令, 且 argv 前缀命中白名单".
 *
 * bash 用 unbash 解析; pwsh 调本机 pwsh 做 ParseInput. 再按白名单检查: 必须恰好
 * 一条简单命令, 不能有管道, 链式, 子 shell, 后台, 重定向, 以及会改写或执行其它
 * 命令的词展开. bash 通过后再去掉命令行前缀形式的环境变量赋值 (以及 `env` 包装),
 * 做 argv 前缀匹配.
 *
 * 本模块只做命令解析, 不涉及任何策略或状态.
 *
 * @module dsh-approve-prefix/prefix/judge
 */
/** 命令所属的 shell 方言. 未列入的工具名按 bash 处理. */
export type CommandDialect = 'bash' | 'pwsh';
/** 一条命令的判定结果. */
export interface PrefixVerdict {
    /** 是否允许自动放行. */
    readonly allowed: boolean;
    /** 判定依据的简短说明, 用于日志与人工排查. */
    readonly detail: string;
}
/** 单命令检查结果. */
export interface CommandInspection {
    /** 是否是一条单命令. */
    readonly ok: boolean;
    /** 去掉环境变量前缀之后的命令 token, 仅当 ok 为 true 时有意义. */
    readonly tokens: readonly string[];
    /** 是否确实去掉了命令行前缀形式的环境变量赋值. */
    readonly strippedEnvironment: boolean;
    /** 判定依据的简短说明. */
    readonly detail: string;
}
/**
 * 检查一条命令是否是单条简单命令, 通过时给出归约后的命令 token.
 * @param command - 模型给出的完整命令文本.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 对命令原文做整串扫描.
 * @param dialect - bash 走 unbash, pwsh 走本机 ParseInput.
 * @returns 检查结果.
 */
export declare function inspectSingleCommand(command: string, extraDeniedCharacters?: readonly string[], dialect?: CommandDialect): CommandInspection;
/**
 * 按引号与 bash 词法给出 argv; 不是单条简单命令时返回 undefined.
 * @param text - 命令文本.
 * @returns token 数组, 或 undefined.
 */
export declare function tokenizeCommand(text: string): string[] | undefined;
/**
 * 判断一条命令是否命中白名单前缀, 且命令本身是单条简单命令.
 * @param command - 模型给出的完整命令文本.
 * @param prefixes - 允许的前缀表, 每项是空格分隔的命令词序列, 例如 `gh api`.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 对命令原文做整串扫描.
 * @param dialect - bash 走 unbash, pwsh 走本机 ParseInput.
 * @returns 判定结果.
 */
export declare function judgeSingleCommandPrefix(command: string, prefixes: readonly string[], extraDeniedCharacters?: readonly string[], dialect?: CommandDialect): PrefixVerdict;
