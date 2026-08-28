import Link from "next/link";
import { getCurrentUser } from "@/modules/identity/service";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/">
          <Logo variant="mark" size={32} />
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium text-neutral-600">
          <Link href="/search" className="hover:text-teal-700">
            تصفح الإعلانات
          </Link>
          {user && (
            <Link href="/listings/mine" className="hover:text-teal-700">
              إعلاناتي
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/listings/new">
            <Button size="sm">+ أضف إعلان</Button>
          </Link>
          {user ? (
            <Link href="/profile" className="text-sm font-medium text-neutral-700 hover:text-teal-700">
              حسابي
            </Link>
          ) : (
            <Link href="/login" className="text-sm font-medium text-neutral-700 hover:text-teal-700">
              تسجيل الدخول
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
