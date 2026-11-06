import { CreateLinkForm } from "./_components/create-link-form";
import { LinksTable } from "./_components/links-table";

// Per-user data that changes on every create/click, so it must never be
// statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Server Component. The interactive parts (form, quota meter, live table)
 * are Client Components. This page and the data loading stay on the server.
 */
export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <div className="brand">
          <span className="logo" aria-hidden>
            ↗
          </span>
          <span className="brand-name">EdgeLink</span>
        </div>
        <h1>Short links, counted live.</h1>
        <p className="subtitle">
          Paste a long URL to get a short one. Signed in as <code>user_demo</code>.
        </p>
      </header>

      <div className="card create-card">
        <CreateLinkForm />
      </div>

      <LinksTable />
    </main>
  );
}
