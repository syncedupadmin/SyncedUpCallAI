import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
export type Emb = number[];

export async function embed(texts: string[]): Promise<Emb[]> {
  const r = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts
  });
  return r.data.map(d => d.embedding as Emb);
}

export function cosine(a: Emb, b: Emb): number {
  let s=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){ const x=a[i], y=b[i]; s+=x*y; na+=x*x; nb+=y*y; }
  return s / (Math.sqrt(na)*Math.sqrt(nb) + 1e-9);
}