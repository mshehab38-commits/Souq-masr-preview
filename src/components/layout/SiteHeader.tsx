import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileNav } from "./MobileNav";
import { NAV_LINKS } from "./nav-links";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/">
          <Logo variant="mark" size={32} />
        </Link>

        {/* Desktop nav — collapses into MobileNav's hamburger panel below md,
            since this row (plus the actions below) has no room to wrap or
            shrink gracefully on a narrow viewport. */}
        <nav className="hidden items-center gap-4 text-sm font-medium text-neutral-600 md:flex">
          <Link href={NAV_LINKS.browse.href} className="hover:text-teal-700">
            {NAV_LINKS.browse.label}
          </Link>
          {user &&
            NAV_LINKS.loggedIn.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-teal-700">
                {link.label}
              </Link>
            ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href={NAV_LINKS.newListing.href}>
            <Button size="sm">{NAV_LINKS.newListing.label}</Button>
          </Link>
          {user && <NotificationBell />}
          {user ? (
            <Link href={NAV_LINKS.profile.href} className="text-sm font-medium text-neutral-700 hover:text-teal-700">
              {NAV_LINKS.profile.label}
            </Link>
          ) : (
            <Link href={NAV_LINKS.login.href} className="text-sm font-medium text-neutral-700 hover:text-teal-700">
              {NAV_LINKS.login.label}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          {user && <NotificationBell />}
          <MobileNav isLoggedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
