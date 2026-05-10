const KNOWN_NATIVE_PATHS = new Set([
  '/',
  '/scan',
  '/alarm',
  '/force-alarm',
  '/register',
  '/history',
  '/settings',
])

function normalizeIncomingPath(path: string): string {
  if (!path) return '/'

  try {
    const url = path.includes('://')
      ? new URL(path)
      : new URL(path, 'timepillv3://local')
    const pathname = url.pathname || '/'

    // Native dev client often opens with its own bootstrap path first.
    if (pathname.includes('expo-development-client')) {
      return '/'
    }

    if (!KNOWN_NATIVE_PATHS.has(pathname)) {
      return '/'
    }

    return `${pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return normalizeIncomingPath(path)
}
