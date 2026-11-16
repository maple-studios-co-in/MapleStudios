import { userInfo } from "node:os";
import { connectDb, disconnectDb } from "../config/db.js";
import { logger } from "../lib/logger.js";
import { resetAuthenticatorForOperator } from "../modules/auth/auth.service.js";

async function main() {
  const [account, reference, acknowledged, ...rest] = process.argv.slice(2);
  if (!account || !/^[a-f0-9]{24}$/i.test(account) ||
      !reference || !/^[A-Z0-9][A-Z0-9._-]{3,79}$/i.test(reference) ||
      acknowledged !== "--identity-verified" || rest.length) {
    console.error("Usage: npm run operator:reset-mfa -- ACCOUNT_ID INCIDENT_REF --identity-verified");
    process.exitCode = 2;
    return;
  }
  const by = userInfo().username;
  await connectDb();
  try {
    await resetAuthenticatorForOperator(account, by, reference);
    logger.warn({ account, reference, by }, "operator reset MFA; earlier sessions revoked");
  } finally {
    await disconnectDb();
  }
}
void main().catch(error => {
  logger.error({ err: error }, "operator MFA recovery failed");
  process.exitCode = 1;
});
