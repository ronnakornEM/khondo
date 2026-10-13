// Loads .env for local scripts. On Vercel the variables are injected, so a missing file is fine.
try {
  process.loadEnvFile?.('.env');
} catch {
  /* no .env file */
}
