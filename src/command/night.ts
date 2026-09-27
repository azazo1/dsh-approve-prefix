/**
 * `/night` 斜杠命令: 会话级 night 开关的第二个入口.
 *
 * 命令与对话视图里的 tab 写的是同一份状态, 所以两边效果一致: 命令改完,
 * tab 下次读取就看到新值; tab 应用后, 命令读到的也是同一个值.
 *
 * 裸调用取反, 也可以写成 `/night on` / `/night off`. 命令走 dsh 的命令生命周期,
 * `command/run` 与 `command/done` 会留下记录, 便于事后核查谁在什么时候开了 night.
 *
 * 开关本身不产生任何模型可见的消息: 打开后由系统提示词段告诉 agent 现在处于 night,
 * agent 下一次请求自然就会读到, 不需要在切换的那一刻去打扰它.
 *
 * @module dsh-approve-prefix/command/night
 */

import type { CommandDefinitionLike, CommandResultLike, PluginContext } from '../host-types.js'
import type { NightStates } from '../night/state.js'
import { sessionKeyOf } from '../prefix/session-key.js'

/** 命令名, 与 client 端贡献的名字必须一致. */
export const NIGHT_COMMAND_NAME = 'night'

/** `/night` 命令需要的宿主状态. */
export interface NightCommandDeps {
  /** 会话级开关表. */
  readonly states: NightStates
}

/** 写一条命令结果. */
function result(kind: 'success' | 'error', text: string): CommandResultLike {
  return kind === 'success' ? { kind: 'success', text } : { kind: 'error', text }
}

/**
 * 注册 `/night` 命令.
 * @param ctx - dsh 的 Cordis Context.
 * @param deps - 命令需要的宿主状态.
 * @returns 注册是否成功; commands 服务还没就绪时返回 false, 由调用方用 inject 稍后重试.
 */
export function installNightCommand(ctx: PluginContext, deps: NightCommandDeps): boolean {
  const commands = ctx.get('commands')
  if (typeof commands !== 'object' || commands === null || !('register' in commands)) return false
  const register = (commands as { register?: unknown }).register
  if (typeof register !== 'function') return false

  const definition: CommandDefinitionLike = {
    name: NIGHT_COMMAND_NAME,
    description: 'Turn night mode on or off for this session',
    input: { hint: '[on|off]' },
    handler: (invocation): CommandResultLike => {
      const argument = invocation.rawInput.trim().toLowerCase()
      if (argument !== '' && argument !== 'on' && argument !== 'off') {
        return result('error', `unknown argument "${argument}"; use /night, /night on or /night off`)
      }
      const sessionKey = sessionKeyOf(invocation.agent)
      if (sessionKey === undefined) {
        return result('error', 'night mode needs a live session; this invocation carries no session identity')
      }

      /* 裸调用取反得到布尔值, on / off 得到写入结果, 两种都归到同一个状态词上. */
      const outcome = argument === '' ? deps.states.toggle(sessionKey) : deps.states.set(sessionKey, argument === 'on')
      if (outcome === undefined) {
        return result('error', 'night mode needs a live session; this invocation carries no session identity')
      }
      if (outcome === 'unchanged') {
        return result('success', argument === 'on'
          ? 'Night mode is already on for this session.'
          : 'Night mode is already off for this session.')
      }
      const on = outcome === 'on' || outcome === true
      ctx.logger.info(`dsh-approve-prefix: night mode ${on ? 'on' : 'off'} for session ${sessionKey}`)
      return result('success', on
        ? 'Night mode on: interactive tools are rejected and only prefix-matched escalations are approved.'
        : 'Night mode off: approvals go back to the human card.')
    },
  }
  register.call(commands, definition)
  return true
}
