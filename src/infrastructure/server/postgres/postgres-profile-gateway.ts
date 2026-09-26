import type { ProfileGateway, ServerProfile, UpdateProfileCommand } from '../../../application/profiles/profile'
import type { SqlDatabase } from '../ports'
import { withActor } from './actor-transaction'

type ProfileRow = Record<string, unknown> & {
  user_id: string
  display_name: string
  bio: string
  languages: string[]
  verification_level: number
}

const columns = 'user_id, display_name, bio, languages, verification_level'

export class PostgresProfileGateway implements ProfileGateway {
  constructor(private readonly database: SqlDatabase) {}

  find(actorId: string): Promise<ServerProfile | null> {
    return withActor(this.database, actorId, async transaction => {
      const result = await transaction.query<ProfileRow>(`SELECT ${columns} FROM profiles WHERE user_id = $1`, [actorId])
      return result.rows[0] ? mapProfile(result.rows[0]) : null
    })
  }

  upsert(command: UpdateProfileCommand): Promise<ServerProfile> {
    return withActor(this.database, command.actorId, async transaction => {
      // verification_level is deliberately absent: only a verification workflow may raise it.
      const result = await transaction.query<ProfileRow>(`
        INSERT INTO profiles (user_id, display_name, bio, languages)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name, bio = EXCLUDED.bio, languages = EXCLUDED.languages, updated_at = now()
        RETURNING ${columns}`,
      [command.actorId, command.displayName, command.bio, command.languages])
      return mapProfile(result.rows[0])
    })
  }
}

function mapProfile(row: ProfileRow | undefined): ServerProfile {
  if (!row) throw new Error('Database did not return a profile')
  return {
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    languages: row.languages,
    verificationLevel: Number(row.verification_level),
  }
}
