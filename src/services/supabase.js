import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../constants/config';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Create Supabase client
export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const signInWithGoogle = async () => {
  try {
    const redirectUrl = Linking.createURL('/');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (data?.url) {
      await Linking.openURL(data.url);
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const signInWithApple = async () => {
  try {
    const redirectUrl = Linking.createURL('/');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (data?.url) {
      await Linking.openURL(data.url);
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const handleAuthCallback = async (url) => {
  if (!url) return;
  
  // Extract tokens from URL hash or query params
  // Supabase usually returns tokens in the hash: #access_token=...&refresh_token=...
  const access_token = url.match(/access_token=([^&]+)/)?.[1];
  const refresh_token = url.match(/refresh_token=([^&]+)/)?.[1];
  
  if (access_token && refresh_token) {
    await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
  }
};

export default supabase;