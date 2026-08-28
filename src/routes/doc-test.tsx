import { createFileRoute } from "@tanstack/react-router";
import { OfficeDocView } from "@/components/materials/OfficeDocView";

export const Route = createFileRoute("/doc-test")({
  component: () => (
    <div className="h-screen p-4">
      <OfficeDocView url="http://127.0.0.1:8099/deck.pptx" title="deck" format="pptx" />
    </div>
  ),
  head: () => ({ meta: [{ title: "Doc test" }] }),
});
