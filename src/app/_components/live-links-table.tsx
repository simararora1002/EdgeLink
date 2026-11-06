"use client";

import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { useTRPC } from "@/trpc/react";
import { CopyButton } from "./copy-button";

type LinkRow = inferRouterOutputs<AppRouter>["links"]["list"][number];

/** How often to re-fetch while the tab is visible. */
const POLL_MS = 2_000;

// Fixed time zone so server HTML and client render match (no hydration
// mismatch from the viewer's local zone).
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * Client half of the list. The server already loaded the rows and passes
 * them in as `initialRows`, so the first paint has data and there's no
 * loading spinner. After that, React Query polls `links.list` to keep the
 * click counts current.
 *
 * Why polling and not push (WebSocket/SSE)? On Workers a normal request
 * can't hold a connection open and fan out updates. That would need a
 * Durable Object. A short poll is stateless and fine for a click counter.
 * Polling stops while the tab is hidden, and the list re-fetches as soon
 * as you come back to the tab.
 */
export function LiveLinksTable({
  initialRows,
  origin,
}: {
  initialRows: LinkRow[];
  origin: string;
}) {
  const trpc = useTRPC();
  const { data: rows } = useQuery(
    trpc.links.list.queryOptions(undefined, {
      initialData: initialRows,
      // Server data is fresh at first paint; don't re-fetch on mount.
      staleTime: 1_000,
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    }),
  );

  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);

  return (
    <section className="links">
      <div className="links-head">
        <h2>
          Your links <span className="count">{rows.length}</span>
        </h2>
        <div className="links-meta">
          <span>{totalClicks} total clicks</span>
          <span className="live" title={`Refreshes every ${POLL_MS / 1000}s`}>
            <span className="live-dot" aria-hidden /> Live
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty card">
          <p className="empty-title">No links yet</p>
          <p>Paste a URL above to create your first short link.</p>
        </div>
      ) : (
        <div className="card table-card">
          <table className="links-table">
            <thead>
              <tr>
                <th>Short link</th>
                <th>Destination</th>
                <th className="num">Clicks</th>
                <th>Created (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((link) => {
                const short = `${origin}/${link.slug}`;
                return (
                  <tr key={link.id}>
                    <td data-label="Short link">
                      <div className="slug-cell">
                        <a href={`/${link.slug}`} target="_blank" rel="noreferrer" className="slug">
                          /{link.slug}
                        </a>
                        <CopyButton text={short} compact />
                      </div>
                    </td>
                    <td data-label="Destination" className="target">
                      <span title={link.targetUrl}>{link.targetUrl}</span>
                    </td>
                    <td data-label="Clicks" className="num">
                      {/* key = value: re-mounts on change, replaying the flash. */}
                      <span key={link.clicks} className="clicks">
                        {link.clicks}
                      </span>
                    </td>
                    <td data-label="Created" className="date">
                      {dateFmt.format(new Date(link.createdAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
