import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ProjectsHome } from "@/components/ProjectsHome";
export default function Page() {
  return <AppShell><Suspense><ProjectsHome /></Suspense></AppShell>;
}
