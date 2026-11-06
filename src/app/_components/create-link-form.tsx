"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { CopyButton } from "./copy-button";
import { AlertIcon, ExternalIcon, LinkIcon } from "./icons";
import { QuotaMeter } from "./quota-meter";

export function CreateLinkForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");

  // Refresh the list and the quota meter after any attempt. A rejected
  // attempt is worth a refresh too: the meter should show "limit reached".
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.links.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.links.quota.queryKey() }),
    ]);

  const create = useMutation(
    trpc.links.create.mutationOptions({
      onSuccess: async () => {
        setUrl("");
        await refresh();
      },
      onError: () => void refresh(),
    }),
  );

  // Show the zod field error if there is one, else the procedure's message.
  const zodMsg = create.error?.data?.zodError?.fieldErrors?.url?.[0];
  const errorMsg = zodMsg ?? create.error?.message;
  const isRateLimited = create.error?.data?.code === "TOO_MANY_REQUESTS";

  // window.location is only read after a successful create (in the
  // browser), so the server render and client render never differ.
  const created = create.data;
  const shortUrl =
    created && typeof window !== "undefined"
      ? `${window.location.origin}/${created.slug}`
      : null;

  return (
    <div className="create">
      <form
        className="create-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ url });
        }}
      >
        <div className="input-wrap">
          <span className="input-icon">
            <LinkIcon />
          </span>
          <input
            type="url"
            name="url"
            required
            autoComplete="off"
            placeholder="Paste a long URL, e.g. https://example.com/a/very/long/path"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (create.isError) create.reset();
            }}
            aria-label="URL to shorten"
            aria-invalid={!!zodMsg}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? <span className="spinner" aria-hidden /> : null}
          {create.isPending ? "Shortening…" : "Shorten"}
        </button>
      </form>

      <QuotaMeter />

      {errorMsg && (
        <div className={`alert ${isRateLimited ? "alert-warn" : "alert-error"}`} role="alert">
          <AlertIcon />
          <span>{errorMsg}</span>
        </div>
      )}

      {created && shortUrl && !errorMsg && (
        <div className="result" role="status">
          <div className="result-label">Your short link is ready</div>
          <div className="result-row">
            <a className="result-url" href={shortUrl} target="_blank" rel="noreferrer">
              {shortUrl}
            </a>
            <div className="result-actions">
              <CopyButton text={shortUrl} />
              <a className="btn btn-secondary" href={shortUrl} target="_blank" rel="noreferrer">
                <ExternalIcon />
                <span>Open</span>
              </a>
            </div>
          </div>
          <div className="result-target" title={created.targetUrl}>
            → {created.targetUrl}
          </div>
        </div>
      )}
    </div>
  );
}
