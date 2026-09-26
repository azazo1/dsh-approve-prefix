/**
 * 放行前缀条目的公共校验.
 *
 * 空工具名, 空前缀, 以及含 `| ; & ` $` 的前缀都不能写入临时表.
 * 判定侧对命令原文另有一整套结构元字符扫描, 比这里更严.
 *
 * @module dsh-approve-prefix/prefix/entry
 */
/** 一条放行前缀. */
export interface PrefixEntry {
    /** 适用的工具名. */
    readonly tool: string;
    /** 空格分隔的命令词序列. */
    readonly prefix: string;
}
/** 前缀里出现这些字符时永远不会被判为单命令, 直接拒绝写入. */
export declare const PREFIX_OPERATORS: readonly string[];
/** 整表替换失败的原因. */
export type PrefixWriteError = 'empty-tool' | 'empty-prefix' | 'operator' | 'duplicate' | 'limit';
/**
 * 校验一条前缀.
 * @param entry - 待校验条目.
 * @returns 通过时为 undefined, 否则是失败原因.
 */
export declare function validatePrefixEntry(entry: {
    readonly tool: string;
    readonly prefix: string;
}): PrefixWriteError | undefined;
/**
 * 校验一整表, 并给出可写入的规范化条目 (trim 后, 保序).
 * @param entries - 待写入条目.
 * @param limit - 单会话条数上限.
 * @returns 通过时带 entries, 失败时带 error.
 */
export declare function normalizePrefixEntries(entries: readonly {
    readonly tool: string;
    readonly prefix: string;
}[], limit: number): {
    ok: true;
    entries: PrefixEntry[];
} | {
    ok: false;
    error: PrefixWriteError;
};
