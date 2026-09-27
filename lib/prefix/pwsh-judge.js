/**
 * pwsh 单命令检查: 调本机 pwsh 做 ParseInput, 再按白名单读 AST 摘要.
 *
 * 脚本只解析不执行. 找不到 pwsh, 解析失败或 JSON 坏掉时 fail-closed.
 *
 * @module dsh-approve-prefix/prefix/pwsh-judge
 */
import { spawnSync } from 'node:child_process';
const INSPECT_SCRIPT = new URL('./pwsh-inspect.ps1', import.meta.url);
const SPAWN_TIMEOUT_MS = 5000;
function fail(detail) {
    return { ok: false, tokens: [], strippedEnvironment: false, detail };
}
function asList(value) {
    if (value === undefined || value === null)
        return [];
    return Array.isArray(value) ? [...value] : [value];
}
function filePathFromUrl(url) {
    const { pathname } = url;
    if (process.platform === 'win32') {
        return decodeURIComponent(pathname.replace(/^\/([A-Za-z]:)/, '$1')).replaceAll('/', '\\');
    }
    return decodeURIComponent(pathname);
}
function describePwshType(type) {
    switch (type) {
        case 'PipelineAst': return 'a pipeline';
        case 'PipelineChainAst': return 'an and-or list';
        case 'AssignmentStatementAst': return 'an assignment';
        case 'ExpandableStringExpressionAst': return 'an expandable string';
        case 'VariableExpressionAst': return 'a variable';
        case 'SubExpressionAst': return 'a subexpression';
        case 'ScriptBlockExpressionAst': return 'a script block';
        case 'ParenExpressionAst': return 'a parenthesized expression';
        default: return type;
    }
}
/**
 * 把 ParseInput 摘要套上与 bash 判定同一套白名单.
 * @param summary - pwsh-inspect.ps1 的 JSON.
 */
export function inspectionFromPwshSummary(summary) {
    const errors = asList(summary.errors).map(message => String(message)).filter(message => message !== '');
    if (errors.length > 0) {
        return fail(`the command could not be parsed: ${errors[0]}`);
    }
    if (summary.statementCount === 0)
        return fail('the command is empty');
    if (summary.statementCount !== 1)
        return fail('the command contains multiple statements');
    if (summary.statementType !== 'PipelineAst') {
        return fail(`the command is ${describePwshType(summary.statementType)}`);
    }
    if (summary.pipelineCount !== 1)
        return fail('the command is a pipeline');
    if (summary.invocation !== '' && summary.invocation !== 'Unknown') {
        return fail('the command uses a call operator');
    }
    if (summary.redirections > 0)
        return fail('the command contains a redirect');
    const elements = asList(summary.elements).map(item => {
        const record = item;
        return { type: String(record.type ?? ''), value: String(record.value ?? '') };
    });
    if (elements.length === 0)
        return fail('the command is not a simple command');
    const tokens = [];
    for (const element of elements) {
        if (element.type !== 'StringConstantExpressionAst') {
            return fail(`the command contains ${describePwshType(element.type)}`);
        }
        tokens.push(element.value);
    }
    return { ok: true, tokens, strippedEnvironment: false, detail: 'a single command' };
}
function parseSummary(stdout) {
    const text = stdout.trim();
    if (text === '')
        return undefined;
    try {
        const raw = JSON.parse(text);
        return {
            errors: asList(raw.errors).map(message => String(message)),
            statementCount: Number(raw.statementCount ?? 0),
            statementType: String(raw.statementType ?? ''),
            pipelineCount: Number(raw.pipelineCount ?? 0),
            invocation: String(raw.invocation ?? ''),
            redirections: Number(raw.redirections ?? 0),
            elements: asList(raw.elements).map(item => {
                const element = item;
                return { type: String(element.type ?? ''), value: String(element.value ?? '') };
            }),
        };
    }
    catch {
        return undefined;
    }
}
/**
 * 调本机 pwsh 解析命令. 找不到解释器时转人工.
 * @param command - 已 trim 的命令原文.
 */
export function inspectPwshCommand(command) {
    const scriptPath = filePathFromUrl(INSPECT_SCRIPT);
    let result;
    try {
        result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', scriptPath], {
            input: command,
            encoding: 'utf8',
            timeout: SPAWN_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
        });
    }
    catch {
        return fail('pwsh is not available to parse the command');
    }
    if (result.error?.code === 'ENOENT') {
        return fail('pwsh is not available to parse the command');
    }
    const summary = parseSummary(result.stdout);
    if (summary === undefined) {
        const stderr = result.stderr.trim();
        if (stderr !== '')
            return fail(`the command could not be parsed: ${stderr}`);
        return fail('pwsh is not available to parse the command');
    }
    return inspectionFromPwshSummary(summary);
}
//# sourceMappingURL=pwsh-judge.js.map