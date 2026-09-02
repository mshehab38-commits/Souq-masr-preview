// Single source of truth for the header's nav link labels/hrefs, shared
// between the desktop nav (SiteHeader, always visible at md and up) and
// the mobile nav (MobileNav, a hamburger-triggered panel below md) so the
// two can never drift out of sync with each other.
export const NAV_LINKS = {
  browse: { href: "/search", label: "تصفح الإعلانات" },
  loggedIn: [
    { href: "/dashboard", label: "لوحة التحكم" },
    { href: "/listings/mine", label: "إعلاناتي" },
    { href: "/orders", label: "طلباتي" },
    { href: "/favorites", label: "المفضلة" },
    { href: "/saved-searches", label: "بحث محفوظ" },
  ],
  newListing: { href: "/listings/new", label: "+ أضف إعلان" },
  profile: { href: "/profile", label: "حسابي" },
  login: { href: "/login", label: "تسجيل الدخول" },
} as const;
