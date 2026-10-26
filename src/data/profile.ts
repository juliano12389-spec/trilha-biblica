import { supabase } from '../lib/supabase';
import type { ProfileRow } from './types';

export interface Profile {
  organizationId: string;
  organizationName: string;
  fullName: string;
  roleCode: string;
}

/** Returns null when the user has signed in but has no organization yet. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('organization_id, full_name, role_code, organizations(name)')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as ProfileRow;
  return {
    organizationId: row.organization_id,
    organizationName: row.organizations?.name ?? '',
    fullName: row.full_name,
    roleCode: row.role_code,
  };
}
