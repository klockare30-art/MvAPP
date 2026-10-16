export interface PublishedVideo {
  id: string;
  coach_id: string;
  goaltender_id: string;
  storage_path: string;
  focus_area: string | null;
  exercise: string | null;
  session_title: string | null;
  team_name: string | null;
  recorded_at: string;
  duration_ms: number;
  frame_rate: number | null;
  coach_note: string | null;
  published_at: string;
}

export interface GoaltenderProfile {
  id: string;
  coach_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  /** Set when this profile is linked to the signed-in user's account. */
  user_id: string | null;
}

export interface VideoComment {
  id: string;
  video_id: string;
  author_id: string;
  author_role: 'trainer' | 'goaltender';
  timestamp_ms: number | null;
  content: string;
  created_at: string;
}

export type CoachStatus = 'pending' | 'active' | 'suspended';

/** A pricing level: what a coach may store and how many goaltenders they may have. */
export interface Plan {
  id: string;
  name: string;
  max_storage_bytes: number;
  max_goaltenders: number;
  price_note: string;
  sort_order: number;
}

/** One coach as the admin sees it (admin_list_coaches). */
export interface AdminCoach {
  id: string;
  email: string;
  name: string;
  status: CoachStatus;
  plan_id: string | null;
  paid_until: string | null;
  created_at: string;
  goaltender_count: number;
  video_count: number;
  storage_bytes: number;
}
