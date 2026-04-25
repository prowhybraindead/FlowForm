import { UserProfile } from '../types';
import { supabase } from './supabase';

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name || 'FlowForm user',
    avatarUrl: row.avatar_url || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

export function isValidAvatarUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.toLowerCase().startsWith('data:')) return false;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function upsertUserProfile(profile: {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}): Promise<UserProfile> {
  const displayName = profile.displayName.trim();
  const avatarUrl = profile.avatarUrl?.trim() || null;

  if (!displayName) {
    throw new Error('Display name is required.');
  }

  if (avatarUrl && !isValidAvatarUrl(avatarUrl)) {
    throw new Error('Avatar URL must be a valid http(s) URL.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: profile.userId,
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .select('user_id, display_name, avatar_url, updated_at')
    .single();

  if (error) throw error;
  return mapProfileRow(data as ProfileRow);
}

export async function ensureUserProfile(profile: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserProfile> {
  const existing = await getUserProfile(profile.userId);
  if (existing) return existing;

  return upsertUserProfile({
    userId: profile.userId,
    displayName: profile.displayName || profile.email || 'FlowForm user',
    avatarUrl: profile.avatarUrl || undefined,
  });
}
