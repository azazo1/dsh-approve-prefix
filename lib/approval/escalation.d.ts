/**
 * 提权审批理由的解析.
 *
 * dsh 的沙箱提权请求把目标档位写在审批理由里, 形如
 * `escalate sandbox to danger-full-access: <模型给出的一句话理由>`,
 * 该格式由 dsh-sandbox 的 approveEscalation 固定.
 *
 * @module dsh-approve-prefix/approval/escalation
 */
/** 提权理由的固定前缀. */
export declare const ESCALATION_REASON_PREFIX = "escalate sandbox to ";
/**
 * 从审批理由中解析提权目标档位.
 * @param reason - 审批请求携带的 reason, 可能缺失.
 * @returns 目标档位名, 不是提权请求时返回 undefined.
 */
export declare function parseEscalationMode(reason: string | undefined): string | undefined;
