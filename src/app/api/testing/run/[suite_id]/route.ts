import { NextRequest, NextResponse } from "next/server";
import { runSuite } from "@/server/testing/bulk-tester";

export async function POST(req: NextRequest, { params }: { params: { suite_id: string } }){
  const { parallel = 10, limit = 100 } = await req.json().catch(()=>({}));
  const suite_id = params.suite_id;
  try {
    await runSuite({ suite_id, parallel, limit });
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: String(e?.message||e) }, { status: 500 });
  }
}