// ====================================================================
// KONFIGURACJA — wpisz tu dane swojego projektu Supabase.
// Znajdziesz je w Supabase: Project Settings -> Data API / API Keys.
//   SUPABASE_URL      -> "Project URL"
//   SUPABASE_ANON_KEY -> "anon" / "public" key (NIE "service_role"!)
// Te dane są bezpieczne do umieszczenia w kodzie strony — anon key jest
// z definicji publiczny, o bezpieczeństwo dba konfiguracja RLS w bazie.
// ====================================================================
const SUPABASE_URL = "https://ivxxtthjkkdaqpedfrth.supabase.co";
const SUPABASE_ANON_KEY = "WKLEJ_TU_SWOJ_SUPABASE_ANON_KEY";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
