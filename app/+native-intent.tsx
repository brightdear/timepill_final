const KNOWN_NATIVE_PATHS = new Set([
  '/',
  '/scan',
  '/alarm',
  '/force-alarm',
  '/register',
  '/check-item',
  '/history',
  '/shop',
  '/crane',
  '/rewards',
  '/settings',
])

function normalizeIncomingPath(path: string): string {
  if (!path) return '/'

  try {
    const url = path.includes('://')
      ? new URL(path)
      : new URL(path, 'timepillv3://local')
    const nativeHostPath = url.hostname && url.hostname !== 'local'
      ? `/${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
      : url.pathname
    const pathname = nativeHostPath || '/'

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
