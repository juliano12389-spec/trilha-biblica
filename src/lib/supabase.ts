import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Only the public URL and the anon key ship in the app. Row Level Security
 * protects the data; the service role key must never be placed in this project.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = url !== '' && anonKey !== '';

// createClient throws on an empty URL, so an inert placeholder is used when
// the environment is missing. The root layout shows a setup screen in that case.
export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.invalid',
  isSupabaseConfigured ? anonKey : 'placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: isSupabaseConfigured,
      detectSessionInUrl: false,
    },
  },
);
