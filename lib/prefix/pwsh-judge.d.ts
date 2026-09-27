/**
 * pwsh 单命令检查: 调本机 pwsh 做 ParseInput, 再按白名单读 AST 摘要.
 *
 * 脚本只解析不执行. 找不到 pwsh, 解析失败或 JSON 坏掉时 fail-closed.
 *
 * @module dsh-approve-prefix/prefix/pwsh-judge
 */
import type { CommandInspection } from './judge.js';
/** pwsh ParseInput 摘要, 由 pwsh-inspect.ps1 打印. */
export interface PwshAstSummary {
    readonly errors: readonly string[];
    readonly statementCount: number;
    readonly statementType: string;
    readonly pipelineCount: number;
    readonly invocation: string;
    readonly redirections: number;
    readonly elements: readonly PwshAstElement[];
}
/** 一个 CommandElement 的类型与去引号后的值. */
export interface PwshAstElement {
    readonly type: string;
    readonly value: string;
}
/**
 * 把 ParseInput 摘要套上与 bash 判定同一套白名单.
 * @param summary - pwsh-inspect.ps1 的 JSON.
 */
export declare function inspectionFromPwshSummary(summary: PwshAstSummary): CommandInspection;
/**
 * 调本机 pwsh 解析命令. 找不到解释器时转人工.
 * @param command - 已 trim 的命令原文.
 */
export declare function inspectPwshCommand(command: string): CommandInspection;
