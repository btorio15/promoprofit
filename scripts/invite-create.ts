/**
 * Mints a single-use invite link and prints it to the terminal (D-02, D-03).
 * No email is sent -- the owner copies/pastes the link themselves. The
 * plaintext token appears ONLY in this stdout output; only its SHA-256 hash
 * is ever stored in the invites table.
 *
 * Usage: npm run invite:create
 */
import { generateInviteToken, hashInviteToken, inviteExpiresAt } from "../src/lib/auth/inviteToken";
import { createInvite } from "../src/lib/auth/accounts";

async function main() {
  const token = generateInviteToken();
  const now = new Date();
  const expiresAt = inviteExpiresAt(now);

  await createInvite(hashInviteToken(token), expiresAt);

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (appUrl) {
    console.log(`${appUrl}/invite/${token}`);
  } else {
    console.log(`/invite/${token}`);
    console.log("Prepend your app's URL (set APP_URL in .env.local to print a full link).");
  }

  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log("Single use. Expires in 7 days.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("invite:create failed:", err);
    process.exit(1);
  });
