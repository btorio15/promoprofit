import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InviteForm } from "@/components/auth/InviteForm";
import { isInviteRedeemable } from "@/lib/auth/accounts";
import { hashInviteToken } from "@/lib/auth/inviteToken";

// Unauthenticated route — renders without the authenticated app shell.
// Always reads live DB state (invite validity), never prerendered.
export const dynamic = "force-dynamic";

/**
 * Invite redemption page (D-03, D-04, D-08). Renders one of two mutually
 * exclusive states -- a valid token shows the account-creation form, an
 * invalid/used/expired token shows the same generic "no longer valid"
 * message regardless of the specific reason (never leaks which reason, per
 * T-02-01).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isInviteRedeemable(hashInviteToken(token), new Date());

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mx-auto w-full max-w-[400px]">
        {valid ? (
          <Card className="p-6">
            <h1 className="text-xl font-semibold">Join MarginMind</h1>
            <p className="text-sm text-muted-foreground">Create your account to get started.</p>
            <InviteForm token={token} />
          </Card>
        ) : (
          <>
            <Card className="p-6">
              <h1 className="text-xl font-semibold">This invite is no longer valid</h1>
              <p className="text-base">
                This link has already been used or has expired. Ask the person who invited you for a new one.
              </p>
            </Card>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-4">
                Log in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
