import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { SettingsBooksForm } from "@/components/settings/SettingsBooksForm";
import { getBonusBooks, getUsableUserBooks } from "@/db/queries";
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

  // usableSaved comes from getUsableUserBooks (CR-02/WR-01, the same
  // predicate / and /onboarding/books use), so a stale saved key that no
  // longer renders as a checkbox is never seeded into initialKeys -- Save
  // changes can always succeed.
  const [books, usableSaved] = await Promise.all([getBonusBooks(), getUsableUserBooks(user.userId)]);
  const initialKeys = usableSaved.map((b) => b.key);

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
