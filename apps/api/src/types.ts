import type { auth } from './lib/auth'

export type AuthUser    = typeof auth.$Infer.Session.user
export type AuthSession = typeof auth.$Infer.Session.session

export type HonoVariables = {
  user:    AuthUser
  session: AuthSession
  userId:  string
}
