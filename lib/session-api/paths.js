/**
 * 会话临时前缀 HTTP 路径.
 *
 * webServer 只有 exact / prefix 两种匹配, 没有参数化路由, 所以挂一条 prefix 根路径,
 * 再由 handler 解析 `/{sessionId}/prefixes`.
 *
 * @module dsh-approve-prefix/session-api/paths
 */
/** 会话临时前缀路由的前缀路径. */
export const SESSION_PREFIX_ROOT = '/api/plugins/dsh-approve-prefix/sessions';
/** 单条会话资源的后缀. */
export const PREFIXES_SUFFIX = '/prefixes';
/** 会话 id 白名单: 与 dsh 实际 id (`session-<uuid>` 等) 对齐. */
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/u;
/**
 * 拼一条会话的前缀表路径.
 * @param sessionId - 会话 id.
 * @returns 绝对路径.
 */
export function prefixesPath(sessionId) {
    return `${SESSION_PREFIX_ROOT}/${encodeURIComponent(sessionId)}${PREFIXES_SUFFIX}`;
}
/**
 * 从请求 URL 取出会话 id.
 * @param url - IncomingMessage.url, 可能带 query.
 * @returns 合法会话 id, 对不上时为 undefined.
 */
export function sessionIdFromUrl(url) {
    const pathname = (url ?? '').split('?')[0] ?? '';
    const head = `${SESSION_PREFIX_ROOT}/`;
    if (!pathname.startsWith(head) || !pathname.endsWith(PREFIXES_SUFFIX))
        return undefined;
    const encoded = pathname.slice(head.length, pathname.length - PREFIXES_SUFFIX.length);
    if (encoded === '' || encoded.includes('/'))
        return undefined;
    let sessionId;
    try {
        sessionId = decodeURIComponent(encoded);
    }
    catch {
        return undefined;
    }
    return SESSION_ID_RE.test(sessionId) ? sessionId : undefined;
}
//# sourceMappingURL=paths.js.map