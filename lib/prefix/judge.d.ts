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
export declare const STRUCTURAL_METACHARACTERS: readonly string[];
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
 * 按引号规则把命令切成 argv, 引号本身不进入 token.
 *
 * 未闭合的引号返回 undefined, 由调用方按拒绝处理.
 * @param text - 已 trim 的命令文本.
 * @returns token 数组, 或 undefined 表示引号不闭合.
 */
export declare function tokenizeCommand(text: string): string[] | undefined;
/**
 * 检查一条命令是否是单条简单命令, 通过时给出归约后的命令 token.
 * @param command - 模型给出的完整命令文本.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 与结构元字符一起参与扫描.
 * @returns 检查结果.
 */
export declare function inspectSingleCommand(command: string, extraDeniedCharacters?: readonly string[]): CommandInspection;
/**
 * 判断一条命令是否命中白名单前缀, 且命令本身是单条简单命令.
 * @param command - 模型给出的完整命令文本.
 * @param prefixes - 允许的前缀表, 每项是空格分隔的命令词序列, 例如 `gh api`.
 * @param extraDeniedCharacters - 额外拒绝的单字符, 与结构元字符一起参与扫描.
 * @returns 判定结果.
 */
export declare function judgeSingleCommandPrefix(command: string, prefixes: readonly string[], extraDeniedCharacters?: readonly string[]): PrefixVerdict;
