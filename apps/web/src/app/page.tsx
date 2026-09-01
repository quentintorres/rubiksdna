import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-8">
      <div className="text-2xl font-extrabold tracking-tight">RUBIKS DNA · State Map</div>
      <p className="text-[15px] leading-relaxed" style={{ color: "var(--sub)" }}>
        Upload the methylation matrices and blood panels your organization already generates.
        Get a versioned state map on the hallmark axes those inputs can honestly support —
        with measurement noise shown, unmeasured axes labeled, and every number traceable to
        its inputs. Research and wellness interpretation only; not a diagnosis.
      </p>
      <div className="flex gap-3">
        <SignedOut>
          <SignInButton>
            <button className="btn">Sign in</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Link href="/dashboard" className="btn">
            Open dashboard
          </Link>
        </SignedIn>
        <a href="https://rubiksdna.vercel.app" className="btn btn-secondary">
          About RUBIKS DNA
        </a>
      </div>
    </main>
  );
}
