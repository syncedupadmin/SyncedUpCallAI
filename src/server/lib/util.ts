import crypto from 'crypto';
export const idemKey = (src: string, ref?: string|null, ended?: string|null) =>
  crypto.createHash('sha256').update(`${src}|${ref||''}|${ended||''}`).digest('hex');
export const asIso = (s?: string|null) => s ? new Date(s).toISOString() : null;
