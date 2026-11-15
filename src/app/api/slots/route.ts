import { NextResponse } from "next/server";
import { growthRequest, GrowthError } from "@/lib/growth-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const result = await growthRequest("/slots", {}, false);
    return NextResponse.json(result, {status:200});
  } catch (error) {
    return NextResponse.json({error: error instanceof GrowthError ? error.message : "The service is temporarily unavailable. Please try again."}, {status:error instanceof GrowthError ? error.status : 503});
  }
}
