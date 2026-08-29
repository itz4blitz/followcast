export function dummySurfaceEnv(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      next[key] = value
    }
  }
  next.GDK_SCALE = '1'
  next.GDK_DPI_SCALE = '1'
  next.PYTHONUNBUFFERED = '1'
  return next
}
