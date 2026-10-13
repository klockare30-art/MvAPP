import type { Goaltender, Team } from '@/domain/types';

export interface TeamRow {
  id: string;
  club_id: string;
  club_name: string;
  name: string;
  age_category: string | null;
  season: string | null;
  logo_uri: string | null;
  created_at: string;
}

export const TEAM_SELECT = `
SELECT t.id, t.club_id, c.name AS club_name, t.name, t.age_category, t.season, t.logo_uri, t.created_at
FROM teams t JOIN clubs c ON c.id = t.club_id`;

export function mapTeam(r: TeamRow): Team {
  return {
    id: r.id,
    clubId: r.club_id,
    clubName: r.club_name,
    name: r.name,
    ageCategory: r.age_category,
    season: r.season,
    logoUri: r.logo_uri,
    createdAt: r.created_at,
  };
}

export interface GoaltenderRow {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  email: string | null;
  photo_uri: string | null;
  user_account_id: string | null;
  created_at: string;
}

export function mapGoaltender(r: GoaltenderRow): Goaltender {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    jerseyNumber: r.jersey_number,
    email: r.email,
    photoUri: r.photo_uri,
    userAccountId: r.user_account_id,
    createdAt: r.created_at,
  };
}
