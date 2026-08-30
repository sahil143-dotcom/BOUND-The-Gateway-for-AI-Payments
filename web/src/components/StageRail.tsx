const STAGES = [
  { id: "request", label: "Request" },
  { id: "authorizing", label: "Authorize" },
  { id: "settle", label: "Settle" },
  { id: "prove", label: "Prove" },
] as const;

export type DemoStage = (typeof STAGES)[number]["id"];

export function StageRail({
  current,
  onJump,
}: {
  current: DemoStage;
  onJump?: (id: DemoStage) => void;
}) {
  const active = STAGES.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-[16px] text-mute">
      {STAGES.map((stage, i) => (
        <li key={stage.id} className="flex items-center gap-2">
          {i > 0 ? <span className="text-line">/</span> : null}
          <button
            type="button"
            disabled={!onJump || i > active}
            onClick={() => onJump?.(stage.id)}
            className={`disabled:cursor-default ${i === active ? "font-medium text-ink" : ""}`}
          >
            {stage.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
