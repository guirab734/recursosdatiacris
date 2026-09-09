import { catalog, demoMode } from "@/lib/catalog";
import { failure, json } from "@/lib/http";
export async function GET() {
  try {
    return json({ products: await catalog(), demo: demoMode() });
  } catch (error) {
    return failure(error);
  }
}
