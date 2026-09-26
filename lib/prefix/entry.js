/**
 * 放行前缀条目的公共校验.
 *
 * 空工具名, 空前缀, 以及含 `| ; & ` $` 的前缀都不能写入临时表.
 * 判定侧对命令原文另有一整套结构元字符扫描, 比这里更严.
 *
 * @module dsh-approve-prefix/prefix/entry
 */
/** 前缀里出现这些字符时永远不会被判为单命令, 直接拒绝写入. */
export const PREFIX_OPERATORS = ['|', ';', '&', '`', '$'];
/**
 * 校验一条前缀.
 * @param entry - 待校验条目.
 * @returns 通过时为 undefined, 否则是失败原因.
 */
export function validatePrefixEntry(entry) {
    if (entry.tool.trim() === '')
        return 'empty-tool';
    if (entry.prefix.trim() === '')
        return 'empty-prefix';
    for (const character of PREFIX_OPERATORS) {
        if (entry.prefix.includes(character))
            return 'operator';
    }
    return undefined;
}
/**
 * 校验一整表, 并给出可写入的规范化条目 (trim 后, 保序).
 * @param entries - 待写入条目.
 * @param limit - 单会话条数上限.
 * @returns 通过时带 entries, 失败时带 error.
 */
export function normalizePrefixEntries(entries, limit) {
    if (entries.length > limit)
        return { ok: false, error: 'limit' };
    const normalized = [];
    const seen = new Set();
    for (const entry of entries) {
        const tool = entry.tool.trim();
        const prefix = entry.prefix.trim();
        const error = validatePrefixEntry({ tool, prefix });
        if (error !== undefined)
            return { ok: false, error };
        const key = `${tool}\u0000${prefix}`;
        if (seen.has(key))
            return { ok: false, error: 'duplicate' };
        seen.add(key);
        normalized.push({ tool, prefix });
    }
    return { ok: true, entries: normalized };
}
//# sourceMappingURL=entry.js.map