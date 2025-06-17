import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createBrowserClient } from "@supabase/ssr";
import type { Route } from "./+types/reset-password";
import { Navigation } from "~/components/ui/Navigation";
import { Footer } from "~/components/ui/Footer";
import { data } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Reset Password | TT Reviews" },
    {
      name: "description",
      content: "Reset your password for TT Reviews account",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  return data({
    env: {
      SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
      SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
        .SUPABASE_ANON_KEY!,
    },
  });
}

export default function ResetPassword({ loaderData }: Route.ComponentProps) {
  const { env } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<
    "form" | "loading" | "success" | "error"
  >("form");
  const [message, setMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    // Check for errors in URL hash first (Supabase recommended pattern)
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const hashError = hashParams.get("error");
    const hashErrorCode = hashParams.get("error_code");
    const hashErrorDescription = hashParams.get("error_description");

    // Handle hash-based errors first
    if (hashError) {
      setStatus("error");
      // Show more user-friendly messages for 4xx errors
      if (hashErrorCode && hashErrorCode.startsWith("4")) {
        if (hashErrorCode === "401") {
          setMessage(
            "Your password reset link has expired. Please request a new password reset email."
          );
        } else if (hashErrorCode === "404") {
          setMessage(
            "Invalid password reset link. Please request a new password reset email."
          );
        } else {
          setMessage(
            hashErrorDescription ||
              "Password reset failed. Please try again or request a new reset email."
          );
        }
      } else {
        setMessage(
          hashErrorDescription ||
            hashError ||
            "Password reset failed. Please try again."
        );
      }
      return;
    }

    // Check if we have the necessary parameters for password reset
    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");

    if (!access_token || !refresh_token) {
      setStatus("error");
      setMessage(
        "Invalid password reset link. Please request a new password reset email."
      );
    }
  }, [searchParams]);

  const handlePasswordReset = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match. Please try again.");
      return;
    }

    if (newPassword.length < 6) {
      setStatus("error");
      setMessage("Password must be at least 6 characters long.");
      return;
    }

    setStatus("loading");

    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");

    const supabase = createBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );

    try {
      // Set the session first
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: access_token!,
        refresh_token: refresh_token!,
      });

      if (sessionError) {
        setStatus("error");
        setMessage(
          "Invalid or expired reset link. Please request a new password reset."
        );
        return;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setStatus("error");
        setMessage(updateError.message);
      } else {
        setStatus("success");
        setMessage(
          "Your password has been updated successfully! You can now sign in with your new password."
        );

        // Redirect to login page after 3 seconds
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        "Something went wrong. Please try again or request a new password reset."
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <span className="text-6xl mb-4 block">🔑</span>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Reset Your Password
            </h1>
            <p className="text-gray-600">Enter your new password below</p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            {status === "form" && (
              <form onSubmit={handlePasswordReset} className="space-y-6">
                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter your new password"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] shadow-lg"
                >
                  Update Password
                </button>
              </form>
            )}

            {status === "loading" && (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Updating Password
                </h2>
                <p className="text-gray-600">
                  Please wait while we update your password...
                </p>
              </div>
            )}

            {status === "success" && (
              <div className="text-center">
                <span className="text-6xl mb-4 block">✅</span>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Password Updated!
                </h2>
                <p className="text-gray-600 mb-4">{message}</p>
                <p className="text-sm text-gray-500">
                  Redirecting to login page in 3 seconds...
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="text-center">
                <span className="text-6xl mb-4 block">❌</span>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Reset Failed
                </h2>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="space-y-3">
                  <button
                    onClick={() => navigate("/login")}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] shadow-lg"
                  >
                    Go to Login
                  </button>
                  <button
                    onClick={() => navigate("/")}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02]"
                  >
                    Back to Homepage
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
