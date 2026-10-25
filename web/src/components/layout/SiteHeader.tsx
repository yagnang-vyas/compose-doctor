import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { cn } from "../../lib/cn";
import { REPO_LINKS } from "../../lib/site";
import { GitHubIcon, LogoMark } from "../ui/icons";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { to: "/playground", label: "Playground" },
  { to: "/docs", label: "Docs" },
  { to: "/examples", label: "Examples" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
    isActive ? "text-fg" : "text-muted hover:text-fg",
  );
}

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight text-fg">
      <LogoMark className="size-7" />
      <span className="text-[15px]">Compose Doctor</span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <a
            href={REPO_LINKS.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <GitHubIcon className="size-4" />
            GitHub
          </a>
        </div>
        <button
          type="button"
          className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-4 pb-4 pt-2 md:hidden">
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cn(navClass({ isActive }), "block py-2.5 text-base")}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li>
              <a
                href={REPO_LINKS.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md px-2.5 py-2.5 text-base font-medium text-muted hover:text-fg"
              >
                <GitHubIcon className="size-4" /> GitHub
              </a>
            </li>
          </ul>
          <div className="mt-3 px-2.5">
            <ThemeToggle />
          </div>
        </nav>
      )}
    </header>
  );
}
