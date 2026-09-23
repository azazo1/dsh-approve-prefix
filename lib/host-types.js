/**
 * 本插件消费的 dsh 宿主接缝的最小结构类型.
 *
 * 插件对宿主包零运行时依赖, 所以这里用结构类型描述 Context, 事件载荷与两个服务视图,
 * 每个字段只取本插件真正读取的部分. 结构对应的宿主定义写在注释里, 升级 dsh 时按这些
 * 出处核对, 不一致会表现为判定失效 (fail-closed, 转人工) 而不是误放行.
 *
 * @module dsh-approve-prefix/host-types
 */
export {};
//# sourceMappingURL=host-types.js.map