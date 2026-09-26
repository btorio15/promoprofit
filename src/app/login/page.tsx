import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/session";

// Unauthenticated route — renders without the authenticated app shell.
// Always reads live session state, never prerendered.
export const dynamic = "force-dynamic";

/**
 * Login page (D-01, D-05, D-07). Already-logged-in visitors are bounced to
 * / rather than shown the form again. There is no self-serve account-
 * recovery or account-creation path anywhere on this screen (D-01, D-07).
 */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mx-auto w-full max-w-[400px]">
        <h1 className="text-center text-xl font-semibold">PromoProfit</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Private access for invited friends.
        </p>
        <Card className="mt-6 p-6">
          <LoginForm />
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account? Ask the person who invited you for a link.
        </p>
      </div>
    </div>
  );
}
