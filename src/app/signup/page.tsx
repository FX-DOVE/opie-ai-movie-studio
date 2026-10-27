import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { PublicNav } from "@/components/PublicSite";
export const metadata = { title: "Sign up" };
export default function Page() { return <><PublicNav /><Suspense><LoginForm mode="up" /></Suspense></>; }
