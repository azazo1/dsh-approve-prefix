/**
 * 本插件自动拒绝时的模型可见反馈.
 * 审批仍只返回 rejected, 原因经 post-execute 关联到同一次失败调用.
 * @module dsh-approve-prefix/approval/rejection-feedback
 */
import type { ApprovalRequestLike, PluginContext } from '../host-types.js';
/** 与 night 系统提示词一致的拒绝后指引. */
export declare const NIGHT_REJECTION_GUIDANCE: string;
/** 自检失败不是人工拒绝, 也不能据此推断 night 已开启. */
export declare function selfCheckRejection(detail: string, night: boolean): string;
/** 有界的一次性反馈表, 以会话, 工具名和 callId 共同关联, 不替其它拒绝原因下结论. */
export declare class RejectionFeedback {
    #private;
    private readonly capacity;
    constructor(capacity: number);
    private key;
    /** 只有插件已经决定拒绝时才记录, 不参与审批判定. */
    remember(request: ApprovalRequestLike, message: string): void;
    private consume;
    /** 只替换宿主把本插件的 rejected 误称为人工拒绝的错误, 不覆盖成功, 取消或其它插件反馈. */
    install(ctx: PluginContext): void;
}
