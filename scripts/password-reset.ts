/**
 * Owner password reset (D-07) -- no in-app self-serve flow exists. Prints a
 * new temporary password to the terminal (or accepts one via --password).
 *
 * Usage: npm run password:reset -- <email> [--password <temp>]
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/auth/password";
import { setPasswordByEmail } from "../src/lib/auth/accounts";

function parseArgs(argv: string[]): { email: string | null; password: string | null } {
  const email = argv[2] ?? null;
  const passwordFlagIndex = argv.indexOf("--password");
  const password = passwordFlagIndex !== -1 ? (argv[passwordFlagIndex + 1] ?? null) : null;
  return { email, password };
}

async function main() {
  const { email: rawEmail, password: explicitPassword } = parseArgs(process.argv);

  if (!rawEmail) {
    console.error("Usage: npm run password:reset -- <email> [--password <temp>]");
    process.exit(1);
    return;
  }
  const email = rawEmail.trim().toLowerCase();

  let tempPassword: string;
  if (explicitPassword !== null) {
    if (explicitPassword.length < 8 || explicitPassword.length > 128) {
      console.error("--password must be between 8 and 128 characters.");
      process.exit(1);
      return;
    }
    tempPassword = explicitPassword;
  } else {
    tempPassword = randomBytes(12).toString("base64url");
  }

  const passwordHash = await hashPassword(tempPassword);
  const updated = await setPasswordByEmail(email, passwordHash);

  if (!updated) {
    console.log("No user with that email.");
    process.exit(1);
    return;
  }

  console.log(`Temporary password for ${email}: ${tempPassword}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("password:reset failed:", err);
    process.exit(1);
  });
