import { WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";

type CreatePageShellProps = {
  title: string;
  children: React.ReactNode;
};

// Title-only header: the form's Cancel button is the way back, and a form page
// doesn't need a breadcrumb, eyebrow, or explainer line above its fields.
export function CreatePageShell({ title, children }: CreatePageShellProps) {
  return (
    <WorkspacePage size="form" className="px-1 py-2 sm:py-3">
      <WorkspaceHeader title={title} />
      {children}
    </WorkspacePage>
  );
}
