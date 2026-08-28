import { createFileRoute } from "@tanstack/react-router";

import { OfficeDocView } from "@/components/materials/OfficeDocView";

export const Route = createFileRoute("/doc-test")({
  component: DocTest,
});

function DocTest() {
  return (
    <div className="grid h-screen grid-cols-2 gap-2 p-2">
      <div className="h-full" data-testid="pptx">
        <OfficeDocView url="/test-deck.pptx" title="deck" format="pptx" />
      </div>
      <div className="h-full" data-testid="docx">
        <OfficeDocView url="/test-doc.docx" title="doc" format="docx" />
      </div>
    </div>
  );
}
