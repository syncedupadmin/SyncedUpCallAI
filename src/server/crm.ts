export async function crmUpsertContact(_i: { phone_e164?: string; first_name?: string; last_name?: string }) {
  return { ok: true, contact_id: crypto.randomUUID() };
}
export async function crmCreatePolicy(_i: { contact_id: string; monthly_premium: number }) {
  return { ok: true, policy_id: Math.floor(Math.random() * 1e9).toString() };
}