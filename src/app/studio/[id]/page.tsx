import { Suspense } from "react";
import { Workspace } from "@/components/ws/Workspace";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense><Workspace id={(await params).id} /></Suspense>;
}
