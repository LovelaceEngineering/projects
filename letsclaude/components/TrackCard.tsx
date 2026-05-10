interface Props {
  title: string;
  description: string;
  courseCount: number;
}

export default function TrackCard({ title, description, courseCount }: Props) {
  return (
    <div className="rounded-xl border border-claude-sand p-7 transition-all hover:border-claude-amber hover:shadow-sm">
      <h3 className="font-serif text-xl font-semibold text-claude-dark">{title}</h3>
      <p className="mt-2 text-sm text-claude-muted leading-relaxed">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-claude-amber">
        {courseCount} courses
      </p>
    </div>
  );
}
