import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/subjects", label: "Subjects" },
  { href: "/reports", label: "Reports" },
  { href: "/dataset", label: "Dataset" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/dashboard" className="text-sm font-extrabold tracking-tight">
            RUBIKS DNA · State Map
          </Link>
          <nav className="flex gap-4 text-[13px] font-medium" style={{ color: "var(--sub)" }}>
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-black">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <OrganizationSwitcher />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <footer
        className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-[12px]"
        style={{ color: "var(--sub)" }}
      >
        Research and wellness interpretation of supplied laboratory data. Not a diagnosis and
        not a substitute for clinical judgment.
      </footer>
    </div>
  );
}
