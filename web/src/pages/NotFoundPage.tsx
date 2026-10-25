import { ButtonLink } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center">
      <p className="font-mono text-sm text-subtle">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-muted">The page you were looking for does not exist.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/" variant="secondary">
          Home
        </ButtonLink>
        <ButtonLink to="/playground" variant="primary">
          Open the playground
        </ButtonLink>
      </div>
    </section>
  );
}
