/**
 * 四条斜杠命令: `/approve-prefix-add`, `-rm`, `-list`, `-clear`.
 *
 * 它们只作用于**当前会话**的临时前缀 (进程内存, 重启即清空):
 * 临时表按 session.id 分组, 命令用调用方的 agent 定位会话, 审批请求用请求自带的 agent 定位,
 * 取不到会话身份时宁可报错也不退化成全局放行.
 *
 * 持久前缀不在命令里改, 由 Settings > 放行前缀 配置页写入 settings (Host 半边只读).
 *
 * 输出排版: 中文分节, 每节一个标题加编号条目, 空节写 `(无)`, 命令末尾回显受影响的会话块.
 *
 * @module dsh-approve-prefix/commands/approve-prefix
 */
import type { CommandDefinitionLike } from '../host-types.js';
import type { PersistentPrefixes } from '../prefix/persistent.js';
import type { TemporaryPrefixes } from '../prefix/temporary.js';
/** 命令渲染需要的宿主状态. */
export interface ApprovePrefixCommandContext {
    /** profile 装配层里的静态前缀, 只随重启生效. */
    readonly staticPrefixes: readonly string[];
    /** 参与判定的工具名. */
    readonly tools: readonly string[];
    /** settings 里的持久前缀, 这里只用于展示. */
    readonly persistent: PersistentPrefixes;
    /** 内存里的会话级临时前缀. */
    readonly temporary: TemporaryPrefixes;
}
/**
 * 创建这个插件注册的全部命令.
 * @param context - 命令渲染需要的宿主状态.
 * @returns 可直接注册的命令定义列表.
 */
export declare function createApprovePrefixCommands(context: ApprovePrefixCommandContext): CommandDefinitionLike[];
