import { Toaster } from "@/components/ui/sonner";
import { NodeConfigDialog } from "@/modules/workflow/components/NodeConfigDialog";
import { NodeDrawer } from "@/modules/workflow/components/NodeDrawer";

export default function WorkflowLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
