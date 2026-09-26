/**
 * 把 `approved` 补进 bash / pwsh (以及 config.tools 里其他工具) 的参数 schema.
 *
 * 模型只填 schema 里出现的字段; 只在 pre-execute 读 extra key 不够, 必须改
 * 注册表里那份活的 parameters. `tools/change` 会在 bash 因 jobs 服务就绪而
 * 重新注册时再打一次补丁. 本函数不得抛错: tools/change 监听器抛错会回滚注册.
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
 * 给当前可见的配置工具打补丁, 并在工具集变化时再打.
 * @param ctx - 用于监听 tools/change.
 * @param tools - 工具注册表.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export declare function installApprovedSchemaPatch(ctx: Pick<PluginContext, 'on'>, tools: ToolsServiceLike, names: readonly string[]): void;
