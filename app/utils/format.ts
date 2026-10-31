export function newId() {
  return crypto.randomUUID()
}

export function isSameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
}

export function formatDay(ts: number) {
  return new Date(ts).toLocaleDateString('ko-KR', { dateStyle: 'long' })
}

export function formatFull(ts: number) {
  return new Date(ts).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })
}

/** Discord's message stamp: today → time, yesterday → 어제, older → date. */
export function formatStamp(ts: number) {
  const now = Date.now()
  if (isSameDay(ts, now)) return `오늘 ${formatTime(ts)}`
  if (isSameDay(ts, now - 86400000)) return `어제 ${formatTime(ts)}`
  return `${new Date(ts).toLocaleDateString('ko-KR')} ${formatTime(ts)}`
}

export function formatCost(usd: number) {
  if (usd === 0) return '$0'
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`
}

export function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** A stable hue per name, for default avatars and AI name colors. */
export function hueOf(text: string) {
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

export function initials(name: string) {
  return name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
}

/** "Anthropic: Claude Opus" → "Claude Opus"; a bare id keeps only its slug. */
export function shortModelName(name: string) {
  return name.split(': ').pop()!.split('/').pop()!
}

/** Scale an uploaded image down to a small data URL so the avatar fits in localStorage. */
export async function imageToAvatar(file: File, size = 128) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const side = Math.min(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  )
  bitmap.close()
  return canvas.toDataURL('image/webp', 0.85)
}
