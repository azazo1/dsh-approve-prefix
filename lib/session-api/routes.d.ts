/**
 * 会话临时前缀的认证 HTTP 路由.
 *
 * 路径挂在 `/api/plugins/dsh-approve-prefix/sessions/...`, 会抢在 connection 的 `/api`
 * 前缀之前命中, 所以认证由 handler 自己向 connection 要一次 `requestRejection`.
 * 认证服务缺席 fail-closed, 503, 不裸放行.
 *
 * @module dsh-approve-prefix/session-api/routes
 */
import type { WebServerLike } from '../host-types.js';
import type { PrefixEntry, PrefixWriteError } from '../prefix/entry.js';
/** GET / PUT 共用的响应体. */
export interface SessionPrefixesPayload {
    readonly entries: readonly PrefixEntry[];
    readonly defaultTool: string;
    readonly limit: number;
}
/** 路由要读的临时表面. */
export interface SessionPrefixRouteHost {
    list(sessionKey: string): readonly PrefixEntry[];
    replace(sessionKey: string, entries: readonly PrefixEntry[]): PrefixWriteError | undefined;
    readonly defaultTool: string;
    readonly limit: number;
}
/** 挂路由时需要的 Context 面. */
export interface SessionPrefixRouteContext {
    effect<T>(callback: () => T): T;
    webServer: WebServerLike;
    get(name: string): unknown;
}
/**
 * 注册会话临时前缀路由.
 * @param ctx - 已经拿到 webServer 的宿主上下文.
 * @param host - 临时表入口.
 */
export declare function mountSessionPrefixRoutes(ctx: SessionPrefixRouteContext, host: SessionPrefixRouteHost): void;
