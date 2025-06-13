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

  return (
    <div className="p-8 min-w-3/4 w-[500px] mx-auto">
      <h1 className="text-2xl">TT Reviews - Login</h1>

      <FeedbackModal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        autoClose={modalState.autoClose}
        autoCloseDelay={modalState.autoCloseDelay}
        onClose={modalState.onClose || closeModal}
      />

      <form onSubmit={handleAuth} className="mt-6">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email:
            </label>
            <input
              id="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              type="email"
              name="email"
              placeholder="Enter your email"
              required
              disabled={modalState.isOpen && modalState.type === "loading"}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-2"
            >
              Password:
            </label>
            <input
              id="password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              type="password"
              name="password"
              placeholder="Enter your password"
              required
              minLength={6}
              disabled={modalState.isOpen && modalState.type === "loading"}
            />
          </div>
          <div className="flex gap-4 mt-4">
            <button
              type="submit"
              name="intent"
              value="login"
              disabled={modalState.isOpen && modalState.type === "loading"}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Login
            </button>
            <button
              type="submit"
              name="intent"
              value="signup"
              disabled={modalState.isOpen && modalState.type === "loading"}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign Up
            </button>
          </div>
        </div>
      </form>

      <div className="mt-8 text-sm text-gray-600">
        <p>
          <strong>Test Account:</strong>
        </p>
        <p>You can create a new account or use existing credentials.</p>
      </div>
    </div>
  );
}
