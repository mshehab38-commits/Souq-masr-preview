import { readCookie } from "@/lib/client-cookies";
import { CSRF_COOKIE_NAME } from "@/lib/cookie-names";

export function csrfHeaders(): HeadersInit {
  return { "Content-Type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE_NAME) ?? "" };
}
