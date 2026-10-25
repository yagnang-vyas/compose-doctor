import { Link } from "react-router-dom";

import { ANALYZER_VERSION } from "../../lib/rules";
import { REPO_LINKS } from "../../lib/site";
import { LogoMark } from "../ui/icons";

const GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Playground", to: "/playground" },
      { label: "Examples", to: "/examples" },
      { label: "Docs", to: "/docs" },
      { label: "Rules", to: "/docs#rules" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub repository", href: REPO_LINKS.repo },
      { label: "README", href: REPO_LINKS.readme },
      { label: "Changelog", href: REPO_LINKS.changelog },
      { label: "Specification", href: REPO_LINKS.spec },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Report an issue", href: REPO_LINKS.newIssue },
      { label: "Contributing", href: REPO_LINKS.contributing },
      { label: "MIT License", href: REPO_LINKS.license },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <LogoMark className="size-6" /> Compose Doctor
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            An open-source linter for Docker Compose files. Version {ANALYZER_VERSION}, MIT licensed.
          </p>
        </div>
        {GROUPS.map((group) => (
          <div key={group.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">{group.title}</h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => (
                <li key={link.label}>
                  {"to" in link ? (
                    <Link to={link.to} className="text-sm text-muted transition-colors hover:text-fg">
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
