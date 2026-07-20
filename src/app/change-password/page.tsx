import { Suspense } from "react";
import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <ChangePasswordForm />
    </Suspense>
  );
}
