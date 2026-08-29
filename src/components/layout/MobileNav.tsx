"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NAV_LINKS } from "./nav-links";

// SiteHeader has no responsive behavior at all below this component's
// breakpoint (md) — every link/button is always rendered, which overflows
// or wraps badly on a narrow viewport. This collapses the same links
// (shared from nav-links.ts, not duplicated, so the two can never drift)
// into a hamburger-triggered panel, shown only below md via the parent's
// `md:hidden` wrapper.
export function MobileNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="القائمة"
        aria-expanded={open}
        className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 hover:text-teal-700"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <nav
          aria-label="روابط الموقع"
          className="fixed inset-x-4 top-16 z-50 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <Link
            href="/search"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {NAV_LINKS.browse.label}
          </Link>
          {isLoggedIn &&
            NAV_LINKS.loggedIn.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {link.label}
              </Link>
            ))}
          <div className="my-1 border-t border-neutral-100" />
          <Link
            href="/listings/new"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            {NAV_LINKS.newListing.label}
          </Link>
          <Link
            href={isLoggedIn ? "/profile" : "/login"}
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {isLoggedIn ? NAV_LINKS.profile.label : NAV_LINKS.login.label}
          </Link>
        </nav>
      )}
    </div>
  );
}
