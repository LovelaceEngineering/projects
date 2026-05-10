import Link from "next/link";

const links = [
  { href: "/training", label: "Training" },
  { href: "/consulting", label: "Consulting" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

export default function Header() {
  return (
    <header className="border-b border-claude-sand px-6 py-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="font-serif text-xl font-bold text-claude-dark">
          Let&apos;s Claude
        </Link>
        <nav className="flex items-center gap-7 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-claude-muted hover:text-claude-dark transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
