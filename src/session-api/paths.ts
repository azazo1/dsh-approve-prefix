/**
 * 会话级 HTTP 路径.
 *
 * webServer 只有 exact / prefix 两种匹配, 没有参数化路由, 所以挂一条 prefix 根路径,
 * 再由 handler 解析 `/{sessionId}/{resource}`.
 *
 * @module dsh-approve-prefix/session-api/paths
 */

/** 会话级资源路由的前缀路径. */
export const SESSION_PREFIX_ROOT = '/api/plugins/dsh-approve-prefix/sessions'

/** 临时前缀表的后缀. */
export const PREFIXES_SUFFIX = '/prefixes'

/** night 开关的后缀. */
export const NIGHT_SUFFIX = '/night'

/** 这条根路径下认识的资源. */
export const SESSION_RESOURCES = [PREFIXES_SUFFIX, NIGHT_SUFFIX] as const

/** 一条会话级资源. */
export type SessionResource = typeof SESSION_RESOURCES[number]

/** 会话 id 白名单: 与 dsh 实际 id (`session-<uuid>` 等) 对齐. */
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/u

/**
 * 拼一条会话的前缀表路径.
 * @param sessionId - 会话 id.
 * @returns 绝对路径.
 */
export function prefixesPath(sessionId: string): string {
  return `${SESSION_PREFIX_ROOT}/${encodeURIComponent(sessionId)}${PREFIXES_SUFFIX}`
}

/**
 * 拼一条会话的 night 开关路径.
 * @param sessionId - 会话 id.
 * @returns 绝对路径.
 */
export function nightPath(sessionId: string): string {
  return `${SESSION_PREFIX_ROOT}/${encodeURIComponent(sessionId)}${NIGHT_SUFFIX}`
}

/**
 * 从请求 URL 取出会话 id 与资源名.
 * @param url - IncomingMessage.url, 可能带 query.
 * @returns 合法资源, 对不上时为 undefined.
 */
export function sessionResourceFromUrl(
  url: string | undefined,
): { readonly sessionId: string, readonly resource: SessionResource } | undefined {
  const pathname = (url ?? '').split('?')[0] ?? ''
  const head = `${SESSION_PREFIX_ROOT}/`
  if (!pathname.startsWith(head)) return undefined
  for (const resource of SESSION_RESOURCES) {
    if (!pathname.endsWith(resource)) continue
    const encoded = pathname.slice(head.length, pathname.length - resource.length)
    if (encoded === '' || encoded.includes('/')) return undefined
    let sessionId: string
    try {
      sessionId = decodeURIComponent(encoded)
    } catch {
      return undefined
    }
    if (!SESSION_ID_RE.test(sessionId)) return undefined
    return { sessionId, resource }
  }
  return undefined
}

/**
 * 从请求 URL 取出会话 id, 只认临时前缀表那条路径.
 * @param url - IncomingMessage.url, 可能带 query.
 * @returns 合法会话 id, 对不上时为 undefined.
 */
export function sessionIdFromUrl(url: string | undefined): string | undefined {
  const resolved = sessionResourceFromUrl(url)
  return resolved !== undefined && resolved.resource === PREFIXES_SUFFIX ? resolved.sessionId : undefined
}
