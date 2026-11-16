import { isIP } from "node:net";

/** Production nginx always replaces X-Real-IP with its peer address. Do not
 * pass along an inbound X-Forwarded-For chain to a loopback API. */
export function forwardClientIp(incoming: Headers, outgoing: Headers) {
  outgoing.delete("x-forwarded-for");
  const ip = incoming.get("x-real-ip");
  if (ip && isIP(ip)) outgoing.set("x-forwarded-for", ip);
}
