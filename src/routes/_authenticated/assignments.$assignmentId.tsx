import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  component: () => <Outlet />,
});
