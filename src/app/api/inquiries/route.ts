import { NextResponse } from "next/server";
import { growthRequest, GrowthError } from "@/lib/growth-server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const result = await growthRequest("/inquiries", {method:"POST",body:await req.text()}, false);
    return NextResponse.json(result, {status:201});
  } catch (error) {
    return NextResponse.json({error: error instanceof GrowthError ? error.message : "The service is temporarily unavailable. Please try again."}, {status:error instanceof GrowthError ? error.status : 503});
  }
}
