import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'
import { user, session, account, verification } from '../db/schema/auth'

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET no está definida. Verificá apps/api/.env')
}

// En prod, la API y el frontend viven en dominios distintos (host de
// despliegue aún sin definir — ver DECISIONS.md), no en subdominios de un
// mismo dominio. SameSite=Lax (default de Better Auth) hace que el
// navegador nunca guarde ni reenvíe la cookie de sesión entre esos dos
// orígenes — el login responde 200 pero la sesión no queda. En local, web y
// api comparten host (localhost:3000 / :3001), donde Lax sí funciona, así
// que este ajuste queda condicionado a producción.
const isProduction = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
  // El rol vive como columna extra en `user` (ver db/schema/auth.ts) — hay que
  // declararlo acá para que Better Auth lo incluya en la sesión y en su tipado.
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'member',
        input: false,
      },
    },
  },
  trustedOrigins: (process.env.WEB_URL ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  advanced: isProduction ? {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  } : undefined,
})

export type Auth = typeof auth
