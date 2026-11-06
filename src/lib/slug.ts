const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Random base62 slug from Web Crypto (available on Workers, Node 20+ and
 * browsers). Not Math.random: slugs should not be guessable.
 *
 * 62^7 ≈ 3.5e12 possible slugs. Collisions are rare, and the unique index
 * plus a retry in the router handles them.
 *
 * Rejection sampling avoids modulo bias: 256 % 62 != 0, so plain
 * `byte % 62` would favour the first 8 characters.
 */
export function generateSlug(length = 7): string {
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length); // 248
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit) out.push(ALPHABET[b % ALPHABET.length]!);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

/** Slugs that would shadow real app routes or look like system paths. */
export const RESERVED_SLUGS = new Set([
  "api",
  "_next",
  "favicon.ico",
  "robots.txt",
  "links",
]);
