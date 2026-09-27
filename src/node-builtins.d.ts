/**
 * 工程 tsconfig 的 types 为空, 给判定器里用到的 Node 内置模块补最小声明.
 */

declare module 'node:child_process' {
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: {
      input?: string
      encoding?: string
      timeout?: number
      windowsHide?: boolean
      maxBuffer?: number
    },
  ): {
    status: number | null
    stdout: string
    stderr: string
    error?: { code?: string; message?: string }
  }
}

declare const process: {
  platform: string
}

interface ImportMeta {
  url: string
}

declare class URL {
  constructor(path: string, base?: string)
  pathname: string
}
