import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "yamboka_session";

/**
 * Redirection de confort : sans cookie de session, on envoie vers la connexion.
 * Ce n'est PAS une protection : l'identité est vérifiée par requireUser() et par l'API sur chaque route.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/connexion", request.url);
    url.searchParams.set("suivant", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/accepter-conditions"],
};
