import "server-only";
import { cache } from "react";
import { createCaller } from "@/server/routers/_app";
import { createContext } from "@/server/trpc";

/**
 * tRPC caller for Server Components. It runs the procedure in-process: same
 * validation and types as the HTTP route, without an RSC fetching its own
 * /api/trpc over the network.
 *
 * `cache` is React's per-request memo, so one render shares one context.
 * Nothing is kept between requests.
 */
export const getServerCaller = cache(async () =>
  createCaller(await createContext()),
);
