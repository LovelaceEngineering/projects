import type { Metadata } from "next";
import Link from "next/link";
import { CALENDLY_URL, CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Consulting — Let's Claude",
  description: "Hands-on consulting for teams adopting the Anthropic platform.",
};

const services = [
  {
    title: "Architecture Review",
    description: "We audit your current Claude integration architecture and provide actionable recommendations for improvement, scalability, and cost optimization.",
  },
  {
    title: "Integration Strategy",
    description: "A tailored roadmap for adopting Claude across your organization — from API design to prompt engineering to deployment patterns.",
  },
  {
    title: "Team Training Workshops",
    description: "Live, hands-on workshops customized for your team's stack, use cases, and skill level. Remote or on-site.",
  },
  {
    title: "Implementation Support",
    description: "Embedded engineering support to help your team ship Claude-powered features — pair programming, code reviews, and production readiness.",
  },
];

export default function ConsultingPage() {
  return (
    <div className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-serif text-4xl font-bold text-claude-dark md:text-5xl">Consulting</h1>
        <p className="mt-3 text-lg text-claude-muted leading-relaxed max-w-xl">
          Hands-on help for teams building with the Anthropic platform.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {services.map((service) => (
            <div
              key={service.title}
              className="rounded-xl border border-claude-sand p-7 transition-all hover:border-claude-amber hover:shadow-sm"
            >
              <h3 className="text-lg font-semibold text-claude-dark">{service.title}</h3>
              <p className="mt-2 text-sm text-claude-muted leading-relaxed">{service.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-claude-sand p-10">
          <h2 className="font-serif text-2xl font-bold text-claude-dark">
            Ready to accelerate your Claude adoption?
          </h2>
          <p className="mt-2 text-claude-muted leading-relaxed">
            Book a free 30-minute discovery call. No commitment.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-claude-amber px-8 py-3.5 font-medium text-white transition-colors hover:bg-claude-amber-dark"
            >
              Book a Discovery Call →
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-claude-muted hover:text-claude-dark transition-colors">
              Or email {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
