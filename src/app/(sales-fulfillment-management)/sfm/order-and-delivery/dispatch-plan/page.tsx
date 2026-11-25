import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DispatchPlanIndexPage() {
  redirect("/sfm/order-and-delivery/dispatch-plan/creation");
}

