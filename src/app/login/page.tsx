import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
export const metadata = { title: "Sign in" };
export default function Page() { return <Suspense><LoginForm /></Suspense>; }
