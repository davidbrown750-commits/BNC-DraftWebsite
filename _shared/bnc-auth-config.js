/* ===========================================================================
   BNC AUTH CONFIG  —  the ONLY file you edit to wire up login.
   All three values below are PUBLIC-safe (meant to live in the browser).
   Never put the Clerk SECRET key, the Supabase SERVICE_ROLE key, or the
   database password in here. Row Level Security protects the data, not these.
   After editing, mirror this file into site-bundle/_shared/ before deploying.
   =========================================================================== */
window.BNC_AUTH_CONFIG = {

  /* Clerk -------------------------------------------------------------------
     clerkFrontendApi: your Clerk instance domain (no https://).
     For the current DEV instance this is already filled in.
     clerkPublishableKey: Clerk dashboard -> API Keys -> Publishable key
     (starts with pk_test_ in dev, pk_live_ in production).                   */
  clerkFrontendApi:    "resolved-mastiff-70.clerk.accounts.dev",
  clerkPublishableKey: "pk_test_cmVzb2x2ZWQtbWFzdGlmZi03MC5jbGVyay5hY2NvdW50cy5kZXYk",

  /* Supabase ----------------------------------------------------------------
     Supabase dashboard -> Project Settings -> API.
     supabaseUrl: the Project URL (https://xxxx.supabase.co)
     supabaseAnonKey: the "anon public" key (safe to expose).                 */
  supabaseUrl:     "https://fypalavrqrozwspfqwuf.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cGFsYXZycXJvendzcGZxd3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzI2NDEsImV4cCI6MjA5NzQwODY0MX0.Xjuzy25GFpvEW6APa28j1HwN4A-i6XZB0eBx9Trn8ac",

  /* Gating knobs ------------------------------------------------------------
     freeManualPages: how many manual "pages" are readable before sign-in.
     pxPerPage: approx rendered height of one printed page in the manual body
     (used to find the chapter boundary nearest the free-page limit).         */
  freeManualPages: 7,
  pxPerPage:       1150
};
