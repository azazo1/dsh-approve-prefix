/**
 * 会话临时前缀的认证 HTTP 路由.
 *
 * 路径挂在 `/api/plugins/dsh-approve-prefix/sessions/...`, 会抢在 connection 的 `/api`
 * 前缀之前命中, 所以认证由 handler 自己向 connection 要一次 `requestRejection`.
 * 认证服务缺席 fail-closed, 503, 不裸放行.
 *
 * @module dsh-approve-prefix/session-api/routes
 */
import { SESSION_PREFIX_ROOT, sessionIdFromUrl } from './paths.js';
/** 请求体上限. */
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
/**
 * 取当前请求的认证栅栏.
 *
 * 必须每次请求惰性读取: apply 可能早于 connection 服务 provide, 在挂载时取一次
 * 再缓存会永久拿到 undefined.
 */
function connectionOf(ctx) {
    const value = ctx.get('connection');
    if (typeof value !== 'object' || value === null)
        return undefined;
    const requestRejection = value.requestRejection;
    return typeof requestRejection === 'function' ? value : undefined;
}
/**
 * 过一遍 dsh 的 Host/Origin 栅栏与浏览器会话认证.
 * @returns true 表示请求已被拒绝 (响应已写好), 调用方直接返回.
 */
function rejected(ctx, req, res) {
    const connection = connectionOf(ctx);
    if (connection === undefined) {
        sendEmpty(res, 503);
        return true;
    }
    const rejection = connection.requestRejection(req);
    if (rejection === undefined)
        return false;
    sendEmpty(res, rejection);
    return true;
}
/**
 * 注册会话临时前缀路由.
 * @param ctx - 已经拿到 webServer 的宿主上下文.
 * @param host - 临时表入口.
 */
export function mountSessionPrefixRoutes(ctx, host) {
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: SESSION_PREFIX_ROOT,
        handler: (req, res) => {
            if (rejected(ctx, req, res))
                return;
            return handle(req, res, host);
        },
    }));
}
async function handle(req, res, host) {
    const sessionId = sessionIdFromUrl(req.url);
    if (sessionId === undefined) {
        sendEmpty(res, 404);
        return;
    }
    const method = req.method ?? '';
    if (method === 'GET') {
        sendJson(res, 200, payloadOf(host, sessionId));
        return;
    }
    if (method === 'PUT') {
        await handlePut(req, res, host, sessionId);
        return;
    }
    sendEmpty(res, 405, 'GET, PUT');
}
async function handlePut(req, res, host, sessionId) {
    if (contentTypeOf(req) !== 'application/json') {
        sendJson(res, 400, { error: 'content-type' });
        return;
    }
    const body = await readBody(req);
    if (body === undefined) {
        sendJson(res, 400, { error: 'body' });
        return;
    }
    const entries = decodeEntries(body);
    if (entries === undefined) {
        sendJson(res, 400, { error: 'body' });
        return;
    }
    const error = host.replace(sessionId, entries);
    if (error !== undefined) {
        sendJson(res, 400, { error });
        return;
    }
    sendJson(res, 200, payloadOf(host, sessionId));
}
function payloadOf(host, sessionId) {
    return {
        entries: host.list(sessionId),
        defaultTool: host.defaultTool,
        limit: host.limit,
    };
}
function contentTypeOf(req) {
    const headers = req.headers;
    if (typeof headers !== 'object' || headers === null)
        return '';
    const raw = headers['content-type'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' ? value.split(';')[0]?.trim().toLowerCase() ?? '' : '';
}
async function readBody(req) {
    if (typeof req[Symbol.asyncIterator] !== 'function')
        return '';
    let text = '';
    try {
        for await (const chunk of req) {
            text += chunkToString(chunk);
            if (text.length > MAX_REQUEST_BODY_BYTES)
                return undefined;
        }
    }
    catch {
        return undefined;
    }
    return text;
}
function chunkToString(chunk) {
    if (typeof chunk === 'string')
        return chunk;
    if (typeof chunk === 'object' && chunk !== null && 'toString' in chunk) {
        return chunk.toString('utf8');
    }
    throw new TypeError('unsupported request chunk');
}
function decodeEntries(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return undefined;
    const entries = parsed['entries'];
    if (!Array.isArray(entries))
        return undefined;
    const result = [];
    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null)
            return undefined;
        const tool = entry['tool'];
        const prefix = entry['prefix'];
        if (typeof tool !== 'string' || typeof prefix !== 'string')
            return undefined;
        result.push({ tool, prefix });
    }
    return result;
}
function sendJson(res, status, body) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
}
function sendEmpty(res, status, allow) {
    res.writeHead(status, allow === undefined ? {} : { allow });
    res.end();
}
//# sourceMappingURL=routes.js.map