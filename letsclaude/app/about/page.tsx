import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Let's Claude",
  description: "Who we are and why we built Let's Claude.",
};

export default function AboutPage() {
  return (
    <div className="px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold">About Let&apos;s Claude</h1>

        <div className="mt-8 space-y-6 text-claude-muted leading-relaxed">
          <p>
            We believe the Anthropic platform is the most capable AI development
            environment available today. But adopting any powerful platform
            without proper guidance leads to costly mistakes and missed
            potential.
          </p>
          <p>
            <strong className="text-claude-dark">Let&apos;s Claude</strong>{" "}
            was founded to bridge that gap. We bring the seriousness and rigor
            of enterprise consulting together with deep expertise in Claude
            Code, the Agent SDK, and the Claude API.
          </p>
          <p>
            Whether you&apos;re an individual developer looking to level up or
            an enterprise team adopting Claude at scale, we have structured
            training tracks and hands-on consulting to get you there.
          </p>
        </div>

        <div className="mt-12 rounded-xl bg-claude-cream p-8">
          <h2 className="text-xl font-semibold">Want to work together?</h2>
          <p className="mt-2 text-claude-muted">
            We&apos;d love to hear about your team&apos;s goals with Claude.
          </p>
          <Link
            href="/consulting"
            className="mt-4 inline-block rounded-lg bg-claude-dark px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-claude-dark/90"
          >
            Book a Discovery Call
          </Link>
        </div>
      </div>
    </div>
  );
}
