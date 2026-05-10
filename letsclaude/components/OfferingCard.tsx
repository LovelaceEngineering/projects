import Link from "next/link";

interface Props {
  title: string;
  description: string;
  href: string;
  icon: string;
}

export default function OfferingCard({ title, description, href, icon }: Props) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-claude-sand p-7 transition-all hover:border-claude-amber hover:shadow-sm"
    >
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-4 font-serif text-xl font-semibold text-claude-dark group-hover:text-claude-amber transition-colors">
        {title}
      </h3>
      <p className="mt-2 text-sm text-claude-muted leading-relaxed">{description}</p>
    </Link>
  );
}
