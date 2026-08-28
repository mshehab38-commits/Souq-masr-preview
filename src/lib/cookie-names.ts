// Deliberately dependency-free so both server-only identity code and client
// components can import these names without pulling in server-only modules
// (e.g. next/headers) into a client bundle.
export const SESSION_COOKIE_NAME = "sm_session";
export const CSRF_COOKIE_NAME = "sm_csrf";
