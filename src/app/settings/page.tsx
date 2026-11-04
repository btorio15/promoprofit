import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { SettingsBooksForm } from "@/components/settings/SettingsBooksForm";
import { SettingsBookCapsForm } from "@/components/settings/SettingsBookCapsForm";
import { SettingsLowProfileForm } from "@/components/settings/SettingsLowProfileForm";
import { getMemberBookCaps } from "@/db/bookCaps";
import { getMemberLowProfile } from "@/db/lowProfile";
import { getMyBookOptions, getUsableUserBooks, getUserMyBookKeys } from "@/db/queries";
import { DEFAULT_MAX_STAKE } from "@/domain/promos/yourCap";
import { formatUsd } from "@/lib/format";
import { requireUser } from "@/lib/session";

// Always reads the user's live saved selection; never prerendered.
export const dynamic = "force-dynamic";

/**
 * Settings page (D-11). Authenticated: renders AppHeader (Settings/Log out
 * stay reachable) but omits the odds status bar and credit banner shown on
 * the main app page -- this screen has no odds/credit concerns. "My books"
 * reuses the identical BookPicker-backed form as onboarding, pre-checked
 * with the user's saved selection (D-12).
 *
 * Shows an explicit back-to-home link above the heading (owner gap closure:
 * the header wordmark link alone wasn't discoverable enough) so there are
 * two independent one-click routes back to the main page.
 */
export default async function SettingsPage() {
  const user = await requireUser();

  // initialKeys come from getUserMyBookKeys (saved sportsbooks and markets
  // that are still hedge venues), so a stale key never seeds a missing
  // checkbox. usableSaved stays sportsbook-only and feeds the caps form,
  // which never lists a market venue.
  const [books, initialKeys, usableSaved, bookCaps, lowProfile] = await Promise.all([
    getMyBookOptions(),
    getUserMyBookKeys(user.userId),
    getUsableUserBooks(user.userId),
    getMemberBookCaps(user.userId),
    getMemberLowProfile(user.userId),
  ]);

  return (
    <>
      <AppHeader displayName={user.displayName} />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-12">
        <div className="flex max-w-[480px] flex-col gap-8">
          <Link
            href="/"
            className="inline-flex min-h-10 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to MarginMind
          </Link>
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

          <Card className="p-6">
            <h2 className="text-xl font-semibold">Max bet per book</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Every profit boost uses a {formatUsd(DEFAULT_MAX_STAKE)} max bet unless you set one here. A boost&apos;s own
              cap still applies if it&apos;s lower, and a cap you set on a single promo always wins.
            </p>
            <SettingsBookCapsForm books={usableSaved} caps={Object.fromEntries(bookCaps)} />
          </Card>

          <Card className="p-6">
            <SettingsLowProfileForm initial={lowProfile} />
          </Card>
        </div>
      </main>
    </>
  );
}
