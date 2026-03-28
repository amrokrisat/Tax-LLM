import { createHash } from "node:crypto";

function sessionScope(sessionToken: string) {
  return createHash("sha1").update(sessionToken).digest("hex").slice(0, 12);
}

export function mattersTag(sessionToken: string) {
  return `matters:${sessionScope(sessionToken)}`;
}

export function matterTag(sessionToken: string, matterId: string) {
  return `matter:${matterId}:${sessionScope(sessionToken)}`;
}
