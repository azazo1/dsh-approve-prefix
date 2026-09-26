/**
 * 会话临时前缀 HTTP 路径.
 *
 * webServer 只有 exact / prefix 两种匹配, 没有参数化路由, 所以挂一条 prefix 根路径,
 * 再由 handler 解析 `/{sessionId}/prefixes`.
 *
 * @module dsh-approve-prefix/session-api/paths
 */
/** 会话临时前缀路由的前缀路径. */
export declare const SESSION_PREFIX_ROOT = "/api/plugins/dsh-approve-prefix/sessions";
/** 单条会话资源的后缀. */
export declare const PREFIXES_SUFFIX = "/prefixes";
/** 会话 id 白名单: 与 dsh 实际 id (`session-<uuid>` 等) 对齐. */
export declare const SESSION_ID_RE: RegExp;
/**
 * 拼一条会话的前缀表路径.
 * @param sessionId - 会话 id.
 * @returns 绝对路径.
 */
export declare function prefixesPath(sessionId: string): string;
/**
 * 从请求 URL 取出会话 id.
 * @param url - IncomingMessage.url, 可能带 query.
 * @returns 合法会话 id, 对不上时为 undefined.
 */
export declare function sessionIdFromUrl(url: string | undefined): string | undefined;
