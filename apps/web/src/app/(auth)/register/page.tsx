import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { oauthErrorMessage } from "@/lib/oauth-errors";

export const metadata = {
  title: "Create your account",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = oauthErrorMessage(error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Starts with just your name, email and a password. Everything else can wait.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <RegisterForm initialError={message} />
          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-primary-700 hover:text-primary-800">
              Log in
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
