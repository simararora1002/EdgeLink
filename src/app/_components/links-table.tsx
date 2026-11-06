import { headers } from "next/headers";
import { getServerCaller } from "@/server/caller";
import { LiveLinksTable } from "./live-links-table";

/**
 * Server half of the list. It loads the first page of data in-process via
 * the tRPC server caller (no HTTP hop), so the HTML arrives already filled
 * in. The client component then keeps the click counts live.
 */
export async function LinksTable() {
  const caller = await getServerCaller();
  const rows = await caller.links.list();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";

  return <LiveLinksTable initialRows={rows} origin={`${proto}://${host}`} />;
}
