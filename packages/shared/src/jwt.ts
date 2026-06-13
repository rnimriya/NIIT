import jwt from "jsonwebtoken";

export interface AppClaims {
  sub: string; // user id
  email: string;
  role: string;
}

const TTL_SECONDS = 60 * 60 * 12; // 12h dev token

/**
 * Dev token signing (HS256). In production this is replaced by Clerk-issued
 * JWTs verified against Clerk JWKS — `verifyToken` becomes a JWKS verify.
 */
export function signDevToken(claims: AppClaims, secret: string): string {
  return jwt.sign(claims, secret, { algorithm: "HS256", expiresIn: TTL_SECONDS });
}

export function verifyToken(token: string, secret: string): AppClaims | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    const { sub, email, role } = decoded as Record<string, unknown>;
    if (typeof sub !== "string" || typeof email !== "string") return null;
    return { sub, email, role: typeof role === "string" ? role : "student" };
  } catch {
    return null;
  }
}

/** Extracts and verifies a Bearer token from an Authorization header value. */
export function claimsFromHeader(
  authHeader: string | undefined,
  secret: string,
): AppClaims | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return verifyToken(authHeader.slice(7), secret);
}
