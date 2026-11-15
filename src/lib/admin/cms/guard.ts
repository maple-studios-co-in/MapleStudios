import { NextResponse } from "next/server";
import { growthRequest, GrowthError } from "../../growth-server";
import { permitsStudio, sameOriginMutation, sessionToken, type StudioRole } from "../access-policy";
export async function denyIfUnauthorized(req: Request): Promise<NextResponse | null> {
  if (sessionToken(req.headers.get("cookie")) && !sameOriginMutation(req)) return NextResponse.json({error:"Request origin was not accepted."},{status:403});
  try {
    const {admin} = await growthRequest<{admin:{role:StudioRole}}>("/auth/me");
    if (!admin || !permitsStudio(admin.role,new URL(req.url).pathname)) return NextResponse.json({error:"Your role cannot access this area."},{status:403});
    return null;
  } catch (error) {
    return NextResponse.json({error:error instanceof GrowthError ? error.message : "Unable to verify your session."},{status:error instanceof GrowthError ? error.status : 503});
  }
}

/** Parse a JSON body, tolerating an empty one. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
