// ====================================================================
// KONFIGURACJA — wpisz tu dane swojego projektu Supabase.
// Znajdziesz je w Supabase: Project Settings -> Data API / API Keys.
//   SUPABASE_URL      -> "Project URL"
//   SUPABASE_ANON_KEY -> "anon" / "public" key (NIE "service_role"!)
// Te dane są bezpieczne do umieszczenia w kodzie strony — anon key jest
// z definicji publiczny, o bezpieczeństwo dba konfiguracja RLS w bazie.
// ====================================================================
const SUPABASE_URL = "https://ivxxtthjkkdaqpedfrth.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eHh0dGhqa2tkYXFwZWRmcnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODI1MzUsImV4cCI6MjA5OTQ1ODUzNX0.QW2lDhl4YY-ldk84fNjBJZzUD_dF6hYMvLOc0nhgKDM";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
