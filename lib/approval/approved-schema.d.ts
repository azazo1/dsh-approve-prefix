/**
 * 把 `approved` 补进 bash / pwsh (以及 config.tools 里其他工具) 的参数 schema.
 *
 * 模型只填 schema 里出现的字段. 全局注册表那份活 parameters 仍打一次补丁
 * (`tools/change` 会在 bash 因 jobs 服务就绪而重新注册时再打). 但 web 装配里
 * bash 在 agent preset 平面, 全局 `tools.get('bash')` 拿不到; assemble 还会
 * structuredClone parameters. 所以真正发给模型的字段补在 `system-prompt/assemble`.
 * 本函数不得抛错: tools/change 监听器抛错会回滚注册, assemble 监听器抛错会让组装失败.
 *
 * @module dsh-approve-prefix/approval/approved-schema
 */
import type { PluginContext, ToolsServiceLike } from '../host-types.js';
/** 模型可见的 `approved` 字段说明, 跟 bash 其他参数一样用英文. */
export declare const APPROVED_PARAMETER_DESCRIPTION: string;
/** 写入工具 schema 的 `approved` 节点. */
export declare const APPROVED_PARAMETER: {
    readonly type: "boolean";
    readonly description: string;
};
/** 注册表里一份工具定义, 只取要改的 parameters. */
export interface PatchableTool {
    readonly parameters: unknown;
}
/**
 * 在一份 JSON Schema 对象根上补 `properties.approved`.
 * @param parameters - 工具的 parameters, 期望是 `{ type: 'object', properties: ... }`.
 * @returns 是否改写了对象.
 */
export declare function patchApprovedParameter(parameters: unknown): boolean;
/**
 * 给一组工具 schema 里名字命中的那些补 `approved`.
 * @param tools - 注册表定义或组装结果里的工具.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export declare function patchApprovedTools(tools: readonly {
    readonly name: string;
    readonly parameters: unknown;
}[], names: readonly string[]): void;
/**
 * 给当前全局可见的配置工具打补丁, 并在工具集变化时再打.
 *
 * 这只能打到全局层. bash / pwsh 在 agent preset 上注册时 `tools.get(name)` 是 undefined,
 * 真正发给模型的 schema 要靠 {@link installApprovedAssemblyPatch}.
 * @param ctx - 用于监听 tools/change.
 * @param tools - 工具注册表.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export declare function installApprovedSchemaPatch(ctx: Pick<PluginContext, 'on'>, tools: ToolsServiceLike, names: readonly string[]): void;
/**
 * 在 `system-prompt/assemble` 上给发给模型的 schema 副本补 `approved`.
 *
 * assemble 会 structuredClone parameters, 且 bash 在 agent 平面, 只改全局注册表打不到模型.
 * 监听器 await next() 后再改, 改的是这一次实际下发的副本; 不得抛错.
 * @param ctx - 用于监听 assemble 瀑布.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export declare function installApprovedAssemblyPatch(ctx: Pick<PluginContext, 'on' | 'get'>, names: readonly string[]): void;
