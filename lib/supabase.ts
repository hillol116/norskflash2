import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
const missingVariables = [
  !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
  !supabaseAnonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
].filter(Boolean)

let validUrl = false
try {
  const parsed = new URL(supabaseUrl)
  validUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:'
} catch { /* Report invalid configuration in the profile menu below. */ }

export const supabaseConfigurationError = missingVariables.length
  ? `This deployment is missing ${missingVariables.join(' and ')}. Enable these variables for Preview in Vercel, then redeploy the feature branch.`
  : !validUrl
    ? 'This deployment has an invalid NEXT_PUBLIC_SUPABASE_URL. Set it to your Supabase project HTTPS URL in Vercel and redeploy.'
    : null

// Keep static builds possible without credentials. Profile selection explicitly
// checks the configuration before making a request; never silently use a dummy URL.
export const supabase = createClient(
  validUrl ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)
