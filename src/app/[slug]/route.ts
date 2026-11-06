import { getDb } from "@/db/client";
import { handleRedirect } from "@/server/redirect";

// A Route Handler, not a page: a redirect has no UI, and it should send a
// bare 302 without rendering anything.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return handleRedirect(await getDb(), slug);
}
