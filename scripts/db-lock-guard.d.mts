export const LOCK_DIR: string
export const INFO: string
export const TOKEN_ENV: string
export const CI_BYPASS_ENV: string
export const CI_BYPASS_VALUE: string
export const LOCK_REQUIRED_MESSAGE: string
export interface LockHolder {
  pid: number
  children: number[]
  startedAt: string
  command: string
  cwd: string
  token?: string
}
export function isAlive(pid: number): boolean
export function readHolder(infoPath?: string): LockHolder | null
export function hasValidLock(options?: { env?: NodeJS.ProcessEnv; infoPath?: string }): boolean
export function assertDbLock(options?: { env?: NodeJS.ProcessEnv; infoPath?: string }): void
