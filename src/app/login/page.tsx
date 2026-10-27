import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { PublicNav } from "@/components/PublicSite";
export const metadata = { title: "Log in" };
export default function Page() { return <><PublicNav /><Suspense><LoginForm mode="in" /></Suspense></>; }
