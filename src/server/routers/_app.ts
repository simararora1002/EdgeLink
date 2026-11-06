import { createCallerFactory, router } from "@/server/trpc";
import { linksRouter } from "./links";

export const appRouter = router({
  links: linksRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
