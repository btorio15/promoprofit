import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { SettingsBooksForm } from "@/components/settings/SettingsBooksForm";
import { getBonusBooks, getUserBookKeys } from "@/db/queries";
import { requireUser } from "@/lib/session";

// Always reads the user's live saved selection; never prerendered.
export const dynamic = "force-dynamic";

/**
 * Settings page (D-11). Authenticated: renders AppHeader (Settings/Log out
 * stay reachable) but omits the odds status bar and credit banner shown on
 * the main app page -- this screen has no odds/credit concerns. "My books"
 * reuses the identical BookPicker-backed form as onboarding, pre-checked
 * with the user's saved selection (D-12).
 */
export default async function SettingsPage() {
  const user = await requireUser();

  const [books, initialKeys] = await Promise.all([getBonusBooks(), getUserBookKeys(user.userId)]);

  return (
    <>
      <AppHeader displayName={user.displayName} />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-12">
        <div className="flex max-w-[480px] flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as {user.displayName} ({user.email})
            </p>
          </div>

          <Card className="p-6">
            <h2 className="text-xl font-semibold">My books</h2>
            <SettingsBooksForm books={books} initialKeys={initialKeys} />
          </Card>
        </div>
      </main>
    </>
  );
}
