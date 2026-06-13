// Runs once when the server process starts. We use it to fail fast on a broken
// environment instead of discovering missing configuration deep inside a request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnv } = await import("@/lib/env");
    validateServerEnv();
  }
}
