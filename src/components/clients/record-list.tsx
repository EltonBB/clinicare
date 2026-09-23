import type { ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

// Small "+ Add" text action for a section header (the section already says what
// it holds, so the label stays generic).
export function AddLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
    >
      <Plus className="size-3.5" />
      Add
    </button>
  );
}

export function RecordActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit record"
        className="flex size-7 items-center justify-center rounded-(--radius-tile) text-muted-foreground transition-colors duration-(--duration-base) hover:bg-secondary/60 hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete record"
          className="flex size-7 items-center justify-center rounded-(--radius-tile) text-muted-foreground transition-colors duration-(--duration-base) hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

// List row for a sub-record: title + inline meta + badge, edit/delete on the
// right. Rows separate by padding and a hover tint, not divider lines.
export function RecordRow({
  title,
  badge,
  meta,
  body,
  onEdit,
  onDelete,
}: {
  title: string;
  badge?: ReactNode;
  meta?: string;
  body?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="-mx-2 flex items-start gap-3 rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {badge}
        </div>
        {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
        {body ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{body}</p>
        ) : null}
      </div>
      <RecordActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}
