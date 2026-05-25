import { WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";

type CreatePageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
};

export function CreatePageShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  children,
}: CreatePageShellProps) {
  return (
    <WorkspacePage size="form" className="px-1 py-2 sm:py-3">
      <WorkspaceHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        backHref={backHref}
        backLabel={backLabel}
      />
      {children}
    </WorkspacePage>
  );
}
