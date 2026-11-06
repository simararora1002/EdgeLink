import { z } from "zod";

/**
 * zod's `.url()` alone accepts `javascript:alert(1)` and `data:...`, because
 * those are valid URLs. Redirecting to them would turn the shortener into an
 * XSS / phishing tool, so we also require http(s).
 */
export const targetUrlSchema = z
  .string()
  .trim()
  .min(1, "Please enter a URL")
  .max(2048, "URL is too long")
  .url("That doesn't look like a valid URL")
  .refine((value) => {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  }, "Only http:// and https:// URLs are allowed");
