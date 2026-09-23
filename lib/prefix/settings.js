/**
 * 持久放行前缀的 settings 契约.
 *
 * 这一份配置落在 dsh 的 settings 里 (settings.yaml 的 `approve-prefix` 段),
 * 由配置页面 (client 半边) 编辑, 跨进程保留. Host 半边只读, 不写.
 *
 * 命名空间与字段名在 client 半边 (`src/client/index.ts`) 里内联了一份同名常量:
 * client bundle 必须自包含, 不能 import 本模块, 所以两边改动必须一起改.
 *
 * @module dsh-approve-prefix/prefix/settings
 */
import z from '@deepseek-ai/schemastery';
/** settings 命名空间, 与插件包名一致. */
export const SETTINGS_NAMESPACE = 'approve-prefix';
/** settings 里的字段名. */
export const PERSISTENT_PREFIXES_FIELD = 'persistentPrefixes';
/** settings 的结构定义. */
export const ApprovePrefixSettingsSchema = z.object({
    [PERSISTENT_PREFIXES_FIELD]: z.array(z.object({
        tool: z.string(),
        prefix: z.string(),
    })).default([]),
});
//# sourceMappingURL=settings.js.map