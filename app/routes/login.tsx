import {
  Link,
  redirect,
  useNavigate,
  data,
  type MetaFunction,
} from "react-router";
import type { Route } from "./+types/login";
import { getServerClient } from "~/lib/supabase.server";
import { createBrowserClient } from "@supabase/ssr";
import { useAsyncOperationWithModal } from "~/hooks/useAsyncOperationWithModal";
import { FeedbackModal } from "~/components/ui/FeedbackModal";
import { Navigation } from "~/components/ui/Navigation";
import { Footer } from "~/components/ui/Footer";

export const meta: MetaFunction = () => {
  return [
    { title: "Login - TT Reviews" },
    {
      name: "description",
      content: "Login to your TT Reviews account",
    },
  ];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse?.data?.user) {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  return data(
    {
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const { env } = loaderData;
  const navigate = useNavigate();
  const { modalState, execute, closeModal } = useAsyncOperationWithModal();

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const dataFields = Object.fromEntries(formData.entries());
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
      "value"
    );

    const supabase = createBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );

    const isSignup = intent === "signup";

    await execute(async () => {
      let result;

      if (isSignup) {
        result = await supabase.auth.signUp({
          email: dataFields.email as string,
          password: dataFields.password as string,
        });
      } else {
        result = await supabase.auth.signInWithPassword({
          email: dataFields.email as string,
          password: dataFields.password as string,
        });
      }

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result;
    }, {
      loadingTitle: isSignup ? "Creating Account" : "Signing In",
      loadingMessage: isSignup 
        ? "Creating your account, please wait..." 
        : "Verifying your credentials...",
      successTitle: isSignup ? "Account Created!" : "Welcome Back!",
      successMessage: isSignup 
        ? "Account created successfully! You can now sign in with your credentials." 
        : "You have been successfully signed in. Redirecting to homepage...",
      errorTitle: "Authentication Failed",
      successRedirect: () => navigate("/"),
      successRedirectDelay: isSignup ? 3000 : 2500
    });
  };

  const handleForgotPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;

    if (!email) {
      await execute(async () => {
        throw new Error("Please enter your email address");
      }, {
        errorTitle: "Email Required"
      });
      return;
    }

    const supabase = createBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );

    await execute(async () => {
      const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result;
    }, {
      loadingTitle: "Sending Reset Email",
      loadingMessage: "Sending password reset instructions...",
      successTitle: "Reset Email Sent!",
      successMessage: "Check your email for password reset instructions.",
      errorTitle: "Reset Failed"
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <span className="text-6xl mb-4 block">🏓</span>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome to TT Reviews
            </h1>
            <p className="text-gray-600">
              Sign in to your account or create a new one
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <FeedbackModal
              isOpen={modalState.isOpen}
              type={modalState.type}
              title={modalState.title}
              message={modalState.message}
              autoClose={modalState.autoClose}
              autoCloseDelay={modalState.autoCloseDelay}
              onClose={modalState.onClose || closeModal}
            />

            <form onSubmit={handleAuth} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  required
                  disabled={modalState.isOpen && modalState.type === "loading"}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                  type="password"
                  name="password"
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  disabled={modalState.isOpen && modalState.type === "loading"}
                />
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  name="intent"
                  value="login"
                  disabled={modalState.isOpen && modalState.type === "loading"}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                >
                  Sign In
                </button>
                
                <button
                  type="submit"
                  name="intent"
                  value="signup"
                  disabled={modalState.isOpen && modalState.type === "loading"}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
                >
                  Create Account
                </button>
              </div>
            </form>
            
            <div className="mt-6 text-center">
              <form onSubmit={handleForgotPassword} className="inline">
                <input type="hidden" name="email" />
                <button
                  type="button"
                  onClick={(e) => {
                    const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
                    const hiddenInput = e.currentTarget.previousElementSibling as HTMLInputElement;
                    hiddenInput.value = emailInput?.value || '';
                    e.currentTarget.closest('form')?.requestSubmit();
                  }}
                  className="text-purple-600 hover:text-purple-800 text-sm font-medium transition-colors"
                >
                  Forgot your password?
                </button>
              </form>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                New to table tennis equipment reviews?{' '}
                <Link to="/" className="text-purple-600 hover:text-purple-800 font-medium transition-colors">
                  Explore our reviews
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
