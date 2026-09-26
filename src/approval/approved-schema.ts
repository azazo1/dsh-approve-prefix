/**
 * 把 `approved` 补进 bash / pwsh (以及 config.tools 里其他工具) 的参数 schema.
 *
 * 模型只填 schema 里出现的字段; 只在 pre-execute 读 extra key 不够, 必须改
 * 注册表里那份活的 parameters. `tools/change` 会在 bash 因 jobs 服务就绪而
 * 重新注册时再打一次补丁. 本函数不得抛错: tools/change 监听器抛错会回滚注册.
 *
 * @module dsh-approve-prefix/approval/approved-schema
 */

import type { PluginContext, ToolsServiceLike } from '../host-types.js'

/** 模型可见的 `approved` 字段说明, 跟 bash 其他参数一样用英文. */
export const APPROVED_PARAMETER_DESCRIPTION
  = 'Optional. true claims this command already matches a user-configured allow prefix. '
    + 'If true but the prefix misses, the call is rejected without a human dialog. '
    + 'Omit this field to keep the dialog.'

/** 写入工具 schema 的 `approved` 节点. */
export const APPROVED_PARAMETER = {
  type: 'boolean',
  description: APPROVED_PARAMETER_DESCRIPTION,
} as const

/** 注册表里一份工具定义, 只取要改的 parameters. */
export interface PatchableTool {
  readonly parameters: unknown
}

/**
 * 在一份 JSON Schema 对象根上补 `properties.approved`.
 * @param parameters - 工具的 parameters, 期望是 `{ type: 'object', properties: ... }`.
 * @returns 是否改写了对象.
 */
export function patchApprovedParameter(parameters: unknown): boolean {
  if (typeof parameters !== 'object' || parameters === null) return false
  const root = parameters as Record<string, unknown>
  if (root['type'] !== undefined && root['type'] !== 'object') return false

  let properties = root['properties']
  if (properties === undefined) {
    try {
      properties = {}
      root['properties'] = properties
    } catch {
      return false
    }
  }
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) return false
  const map = properties as Record<string, unknown>
  const existing = map['approved']
  if (existing !== undefined) {
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) return false
    const node = existing as Record<string, unknown>
    if (node['type'] !== undefined && node['type'] !== 'boolean') return false
    if (node['type'] === 'boolean' && node['description'] === APPROVED_PARAMETER_DESCRIPTION) return false
  }
  try {
    map['approved'] = { type: 'boolean', description: APPROVED_PARAMETER_DESCRIPTION }
    return true
  } catch {
    return false
  }
}

/**
 * 给当前可见的配置工具打补丁, 并在工具集变化时再打.
 * @param ctx - 用于监听 tools/change.
 * @param tools - 工具注册表.
 * @param names - 要补字段的工具名, 通常是 config.tools.
 */
export function installApprovedSchemaPatch(
  ctx: Pick<PluginContext, 'on'>,
  tools: ToolsServiceLike,
  names: readonly string[],
): void {
  const patchAll = (): void => {
    for (const name of names) {
      const tool = tools.get(name)
      if (tool === undefined) continue
      patchApprovedParameter(tool.parameters)
    }
  }
  patchAll()
  ctx.on('tools/change', patchAll)
}
