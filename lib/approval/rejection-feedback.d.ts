/**
 * 工具反馈的改写: 本插件自动拒绝时的说明, 以及宿主 "拒绝即终结" 尾句的替换.
 * 审批仍只返回 rejected, 原因经 post-execute 关联到同一次失败调用.
 * @module dsh-approve-prefix/approval/rejection-feedback
 */
import type { ApprovalRequestLike, PluginContext } from '../host-types.js';
/** 与 night 系统提示词一致的拒绝后指引. */
export declare const NIGHT_REJECTION_GUIDANCE: string;
/** 自检失败不是人工拒绝, 也不能据此推断 night 已开启. */
export declare function selfCheckRejection(detail: string, night: boolean): string;
/**
 * 把宿主 "拒绝即终结" 的尾句换成允许重新阐述后再发起的表述.
 * 只认领逐字相同的宿主文案: 尾句变了就原样放行, 不猜宿主的新意思.
 * @param message - 宿主给出的工具错误文本.
 * @returns 改写后的整句, 不是这句宿主文案时返回 undefined.
 */
export declare function retryableRejection(message: string): string | undefined;
/** 有界的一次性反馈表, 以会话, 工具名和 callId 共同关联, 不替其它拒绝原因下结论. */
export declare class RejectionFeedback {
    #private;
    private readonly capacity;
    constructor(capacity: number);
    private key;
    /** 只有插件已经决定拒绝时才记录, 不参与审批判定. */
    remember(request: ApprovalRequestLike, message: string): void;
    private consume;
    /** 该次失败调用要替换成的文本: 插件自己的拒绝说明优先, 否则只换宿主的终结尾句. */
    private replacement;
    /** 只改写拒绝类错误: 插件自动拒绝的整段, 或任何来源拒绝时的宿主终结尾句. */
    install(ctx: PluginContext): void;
}
