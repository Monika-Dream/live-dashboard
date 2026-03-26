import { getSiteConfig } from "../services/site-config";

export function handleConfig(): Response {
  return Response.json(getSiteConfig());
}
