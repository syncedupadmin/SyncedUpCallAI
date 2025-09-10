export function withinCancelWindow(iso: string | null | undefined) {
  if (!iso) return false;
  const started = new Date(iso).getTime();
  return Date.now() - started <= 24 * 60 * 60 * 1000;
}