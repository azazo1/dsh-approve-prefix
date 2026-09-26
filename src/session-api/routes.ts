/**
 * 会话临时前缀的认证 HTTP 路由.
 *
 * 路径挂在 `/api/plugins/dsh-approve-prefix/sessions/...`, 会抢在 connection 的 `/api`
 * 前缀之前命中, 所以认证由 handler 自己向 connection 要一次 `requestRejection`.
 * 认证服务缺席 fail-closed, 503, 不裸放行.
 *
 * @module dsh-approve-prefix/session-api/routes
 */

import type {
  ConnectionServiceLike,
  HttpRequestLike,
  HttpResponseLike,
  WebServerLike,
} from '../host-types.js'
import type { PrefixEntry, PrefixWriteError } from '../prefix/entry.js'
import { SESSION_PREFIX_ROOT, sessionIdFromUrl } from './paths.js'

/** 请求体上限. */
const MAX_REQUEST_BODY_BYTES = 16 * 1024

/** GET / PUT 共用的响应体. */
export interface SessionPrefixesPayload {
  readonly entries: readonly PrefixEntry[]
  readonly defaultTool: string
  readonly limit: number
}

/** 路由要读的临时表面. */
export interface SessionPrefixRouteHost {
  list(sessionKey: string): readonly PrefixEntry[]
  replace(sessionKey: string, entries: readonly PrefixEntry[]): PrefixWriteError | undefined
  readonly defaultTool: string
  readonly limit: number
}

/** 挂路由时需要的 Context 面. */
export interface SessionPrefixRouteContext {
  effect<T>(callback: () => T): T
  webServer: WebServerLike
  get(name: string): unknown
}

/**
 * 取当前请求的认证栅栏.
 *
 * 必须每次请求惰性读取: apply 可能早于 connection 服务 provide, 在挂载时取一次
 * 再缓存会永久拿到 undefined.
 */
function connectionOf(ctx: SessionPrefixRouteContext): ConnectionServiceLike | undefined {
  const value = ctx.get('connection')
  if (typeof value !== 'object' || value === null) return undefined
  const requestRejection = (value as ConnectionServiceLike).requestRejection
  return typeof requestRejection === 'function' ? value as ConnectionServiceLike : undefined
}

/**
 * 过一遍 dsh 的 Host/Origin 栅栏与浏览器会话认证.
 * @returns true 表示请求已被拒绝 (响应已写好), 调用方直接返回.
 */
function rejected(ctx: SessionPrefixRouteContext, req: HttpRequestLike, res: HttpResponseLike): boolean {
  const connection = connectionOf(ctx)
  if (connection === undefined) {
    sendEmpty(res, 503)
    return true
  }
  const rejection = connection.requestRejection(req)
  if (rejection === undefined) return false
  sendEmpty(res, rejection)
  return true
}

/**
 * 注册会话临时前缀路由.
 * @param ctx - 已经拿到 webServer 的宿主上下文.
 * @param host - 临时表入口.
 */
export function mountSessionPrefixRoutes(ctx: SessionPrefixRouteContext, host: SessionPrefixRouteHost): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: SESSION_PREFIX_ROOT,
    handler: (req, res) => {
      if (rejected(ctx, req, res)) return
      return handle(req, res, host)
    },
  }))
}

async function handle(req: HttpRequestLike, res: HttpResponseLike, host: SessionPrefixRouteHost): Promise<void> {
  const sessionId = sessionIdFromUrl(req.url)
  if (sessionId === undefined) {
    sendEmpty(res, 404)
    return
  }
  const method = req.method ?? ''
  if (method === 'GET') {
    sendJson(res, 200, payloadOf(host, sessionId))
    return
  }
  if (method === 'PUT') {
    await handlePut(req, res, host, sessionId)
    return
  }
  sendEmpty(res, 405, 'GET, PUT')
}

async function handlePut(
  req: HttpRequestLike,
  res: HttpResponseLike,
  host: SessionPrefixRouteHost,
  sessionId: string,
): Promise<void> {
  if (contentTypeOf(req) !== 'application/json') {
    sendJson(res, 400, { error: 'content-type' })
    return
  }
  const body = await readBody(req)
  if (body === undefined) {
    sendJson(res, 400, { error: 'body' })
    return
  }
  const entries = decodeEntries(body)
  if (entries === undefined) {
    sendJson(res, 400, { error: 'body' })
    return
  }
  const error = host.replace(sessionId, entries)
  if (error !== undefined) {
    sendJson(res, 400, { error })
    return
  }
  sendJson(res, 200, payloadOf(host, sessionId))
}

function payloadOf(host: SessionPrefixRouteHost, sessionId: string): SessionPrefixesPayload {
  return {
    entries: host.list(sessionId),
    defaultTool: host.defaultTool,
    limit: host.limit,
  }
}

function contentTypeOf(req: HttpRequestLike): string {
  const headers = req.headers
  if (typeof headers !== 'object' || headers === null) return ''
  const raw = (headers as Record<string, unknown>)['content-type']
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.split(';')[0]?.trim().toLowerCase() ?? '' : ''
}

async function readBody(req: HttpRequestLike): Promise<string | undefined> {
  if (typeof req[Symbol.asyncIterator] !== 'function') return ''
  let text = ''
  try {
    for await (const chunk of req as AsyncIterable<unknown>) {
      text += chunkToString(chunk)
      if (text.length > MAX_REQUEST_BODY_BYTES) return undefined
    }
  } catch {
    return undefined
  }
  return text
}

function chunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (typeof chunk === 'object' && chunk !== null && 'toString' in chunk) {
    return (chunk as { toString(encoding?: string): string }).toString('utf8')
  }
  throw new TypeError('unsupported request chunk')
}

function decodeEntries(text: string): PrefixEntry[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const entries = (parsed as Record<string, unknown>)['entries']
  if (!Array.isArray(entries)) return undefined
  const result: PrefixEntry[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const tool = (entry as Record<string, unknown>)['tool']
    const prefix = (entry as Record<string, unknown>)['prefix']
    if (typeof tool !== 'string' || typeof prefix !== 'string') return undefined
    result.push({ tool, prefix })
  }
  return result
}

function sendJson(res: HttpResponseLike, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function sendEmpty(res: HttpResponseLike, status: number, allow?: string): void {
  res.writeHead(status, allow === undefined ? {} : { allow })
  res.end()
}
