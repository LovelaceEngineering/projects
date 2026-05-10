import type { Metadata } from "next";
import TrackCard from "@/components/TrackCard";

export const metadata: Metadata = {
  title: "Training — Let's Claude",
  description: "Structured courses and tracks to master the Anthropic platform.",
};

const tracks = [
  {
    title: "Claude Code Mastery",
    description: "Master the CLI, hooks, MCP servers, and agent workflows. From first install to production automation.",
    courseCount: 4,
  },
  {
    title: "Building with Agent SDK",
    description: "Build custom agents with tool use, orchestration patterns, and multi-agent systems.",
    courseCount: 3,
  },
  {
    title: "Claude API & Integration",
    description: "API patterns, SDK usage, streaming, vision, and production deployment strategies.",
    courseCount: 3,
  },
  {
    title: "Claude for Enterprise",
    description: "Governance frameworks, security best practices, and team adoption strategy for large organizations.",
    courseCount: 3,
  },
];

export default function TrainingPage() {
  return (
    <div className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-serif text-4xl font-bold text-claude-dark md:text-5xl">Training Tracks</h1>
        <p className="mt-3 text-lg text-claude-muted leading-relaxed max-w-xl">
          Structured learning paths to master every aspect of the Anthropic platform.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {tracks.map((track) => (
            <TrackCard key={track.title} {...track} />
          ))}
        </div>
        <div className="mt-12 rounded-xl border border-claude-sand p-8">
          <h2 className="font-serif text-xl font-semibold text-claude-dark">Need custom training for your team?</h2>
          <p className="mt-2 text-claude-muted leading-relaxed">
            We offer tailored workshops and training programs for enterprise teams.
          </p>
          <a
            href="/consulting"
            className="mt-5 inline-flex items-center rounded-lg bg-claude-amber px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-claude-amber-dark"
          >
            Book a Discovery Call
          </a>
        </div>
      </div>
    </div>
  );
}
