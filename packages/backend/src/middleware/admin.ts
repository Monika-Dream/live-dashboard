const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "";

function readToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  return (req.headers.get("x-admin-token") || "").trim();
}

export function ensureAdminAuthorized(req: Request): Response | null {
  if (!ADMIN_TOKEN) {
    return Response.json(
      { error: "ADMIN_TOKEN not configured on server" },
      { status: 503 },
    );
  }

  const token = readToken(req);
  if (!token || token !== ADMIN_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
