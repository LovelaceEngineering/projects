import Hero from "@/components/Hero";
import OfferingCard from "@/components/OfferingCard";
import Link from "next/link";

const offerings = [
  {
    title: "Training",
    description: "Structured courses and tracks to master Claude Code, Agent SDK, and the Claude API.",
    href: "/training",
    icon: "🎓",
  },
  {
    title: "Consulting",
    description: "Architecture reviews, integration strategy, and hands-on implementation support.",
    href: "/consulting",
    icon: "🏗️",
  },
  {
    title: "Blog",
    description: "Tutorials, case studies, and insights on building with the Anthropic platform.",
    href: "/blog",
    icon: "📝",
  },
];

export default function Home() {
  return (
    <>
      <Hero />

      {/* Social Proof */}
      <section className="border-b border-claude-sand px-6 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-claude-muted">
          Trusted by teams building with Claude
        </p>
        <div className="mt-4 flex items-center justify-center gap-10 opacity-30">
          <span className="text-base font-semibold text-claude-dark">Company A</span>
          <span className="text-base font-semibold text-claude-dark">Company B</span>
          <span className="text-base font-semibold text-claude-dark">Company C</span>
        </div>
      </section>

      {/* Offerings */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-serif text-3xl font-bold text-claude-dark md:text-4xl">How We Help</h2>
          <p className="mt-3 text-claude-muted max-w-xl">
            Everything you need to adopt Claude with confidence
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {offerings.map((offering) => (
              <OfferingCard key={offering.title} {...offering} />
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials placeholder */}
      <section className="border-t border-claude-sand px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-serif text-3xl font-bold text-claude-dark md:text-4xl">What Teams Are Saying</h2>
          <div className="mt-8 rounded-xl border border-claude-sand p-8">
            <p className="text-lg italic text-claude-muted leading-relaxed">
              &ldquo;Testimonials coming soon. We&apos;re working with early
              adopters to share their stories.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-claude-sand px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-serif text-3xl font-bold text-claude-dark md:text-4xl">Ready to Get Started?</h2>
          <p className="mt-3 text-claude-muted">
            Book a free discovery call to discuss your team&apos;s needs.
          </p>
          <Link
            href="/consulting"
            className="mt-8 inline-flex items-center rounded-lg bg-claude-amber px-8 py-3.5 font-medium text-white transition-colors hover:bg-claude-amber-dark"
          >
            Book a Discovery Call
          </Link>
        </div>
      </section>
    </>
  );
}
