// ========================================================
// SmartCare - Supabase Configuration & Client Initialization
// ========================================================

const SUPABASE_URL = 'https://nspkvwgvwktfidbgtplo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_08oKvhmDTpoPo4GxgxcefA_5Yt5giFD';

// Initialize the official Supabase JS Client (v2)
let supabaseClient = null;

function isSupabaseConfigured() {
  return (
    typeof supabase !== 'undefined' &&
    SUPABASE_URL &&
    SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' &&
    !SUPABASE_URL.includes('YOUR_') &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
    !SUPABASE_ANON_KEY.includes('YOUR_')
  );
}

try {
  if (isSupabaseConfigured()) {
    // Strip trailing slash or /rest/v1 if inadvertently added
    const cleanUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    supabaseClient = supabase.createClient(cleanUrl, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    console.log('Supabase client successfully initialized with project:', cleanUrl);
  } else {
    console.warn(
      'Supabase credentials are not set in supabase-config.js. Operating in LocalStorage fallback mode.'
    );
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
}
