import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { Brand } from "@/components/Brand";
import { ArrowLeftRight, ChartNoAxesCombined, Ticket } from "lucide-react";
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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/15 bg-[#080808] px-6 py-5 text-white sm:px-10"><Brand /></header>
      <main className="grid flex-1 lg:grid-cols-2">
        <section className="sportsbook-hero relative isolate flex flex-col justify-center overflow-hidden px-6 py-12 text-white sm:px-12 lg:px-16 lg:py-20">
          <div className="relative z-10 mx-auto w-full max-w-lg">
            <p className="mb-5 text-xs font-bold tracking-[0.2em] text-blue-200">YOUR SPORTSBOOK EDGE</p>
            <h1 className="text-5xl font-black leading-[0.92] tracking-[-0.05em] sm:text-6xl lg:text-8xl">More from<br />every promo.</h1>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-blue-100">Find the opportunity. Know your stakes. Keep track of your profit.</p>
            <div className="mt-10 flex flex-wrap gap-5 border-t border-white/20 pt-6 text-sm font-semibold text-blue-100">
              <span className="inline-flex items-center gap-2"><Ticket className="size-4" aria-hidden="true" />Promos</span>
              <span className="inline-flex items-center gap-2"><ArrowLeftRight className="size-4" aria-hidden="true" />Arbitrage</span>
              <span className="inline-flex items-center gap-2"><ChartNoAxesCombined className="size-4" aria-hidden="true" />Profit tracking</span>
            </div>
          </div>
          <div className="sportsbook-court" aria-hidden="true" />
        </section>
        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-[400px]">
            <p className="mb-2 text-xs font-bold tracking-[0.16em] text-primary">WELCOME BACK</p>
            <h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Log in to MarginMind</h2>
            <p className="mt-2 text-sm text-muted-foreground">Private access for invited friends.</p>
            <Card className="mt-7 p-6 shadow-sm"><LoginForm /></Card>
            <p className="mt-5 text-center text-sm text-muted-foreground">No account? Ask the person who invited you for a link.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
