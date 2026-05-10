import Link from "next/link";

export default function Hero() {
  return (
    <section className="bg-grid-pattern border-b border-claude-sand px-6 py-28">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="font-serif text-5xl font-bold text-claude-dark md:text-6xl">
          Master the Anthropic Platform
        </h1>
        <p className="mt-6 text-lg text-claude-muted md:text-xl max-w-2xl mx-auto leading-relaxed">
          Enterprise training and consulting for Claude Code, the Agent SDK, and the Claude API.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/training"
            className="rounded-lg bg-claude-amber px-7 py-3.5 font-medium text-white transition-colors hover:bg-claude-amber-dark"
          >
            Browse Training
          </Link>
          <Link
            href="/consulting"
            className="rounded-lg border border-claude-sand px-7 py-3.5 font-medium text-claude-dark transition-colors hover:border-claude-amber"
          >
            Book a Call
          </Link>
        </div>
      </div>
    </section>
  );
}
