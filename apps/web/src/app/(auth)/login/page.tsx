import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { oauthErrorMessage } from "@/lib/oauth-errors";

/** Friendly copy for error codes that only make sense on the login page. */
const LOGIN_ONLY_MESSAGES: Record<string, string> = {
  google_already_linked: "That Google account is already connected to a MoneyPilot account. Log in with Google instead.",
};

export const metadata = {
  title: "Log in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = oauthErrorMessage(error) ?? (error ? (LOGIN_ONLY_MESSAGES[error] ?? null) : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to your MoneyPilot account.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="mt-[-1px]">
            <LoginForm initialError={message} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <a href="/register" className="font-medium text-primary-700 hover:text-primary-800">
              Create an account
            </a>
            <a href="/forgot-password" className="font-medium text-primary-700 hover:text-primary-800">
              Forgot password?
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
