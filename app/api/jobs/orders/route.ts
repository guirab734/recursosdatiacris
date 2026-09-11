import { timingSafeEqual } from "node:crypto";
import { processOrderJobs } from "@/lib/order-processing";
import { json, failure, HttpError } from "@/lib/http";
export const maxDuration = 180;
export async function GET(request: Request) {
  try {
    const expected = process.env.CRON_SECRET;
    const received =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (
      !expected ||
      expected.length < 32 ||
      Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      throw new HttpError(401, "Não autorizado.");
    return json(await processOrderJobs(3));
  } catch (e) {
    return failure(e);
  }
}
