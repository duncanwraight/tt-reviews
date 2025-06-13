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
import { useState } from "react";

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
  const [error, setError] = useState<string | null>(null);
  const { env } = loaderData;
  const navigate = useNavigate();

  const doLogin = async (event: React.FormEvent<HTMLFormElement>) => {
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

    try {
      let result;

      if (intent === "signup") {
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
        console.log(result.error);
        setError(result.error.message);
        return;
      }

      if (result.data.session) {
        navigate("/");
      } else if (intent === "signup") {
        setError("Please check your email to confirm your account");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    }
  };

  return (
    <div className="p-8 min-w-3/4 w-[500px] mx-auto">
      <h1 className="text-2xl">TT Reviews - Login</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mt-4">
          {error}
        </div>
      )}

      <form className="mt-6" onSubmit={doLogin}>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email:
            </label>
            <input
              id="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="email"
              name="email"
              placeholder="Enter your email"
              required
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="password"
              name="password"
              placeholder="Enter your password"
              required
              minLength={6}
            />
          </div>
          <div className="flex gap-4 mt-4">
            <button
              type="submit"
              name="intent"
              value="login"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Login
            </button>
            <button
              type="submit"
              name="intent"
              value="signup"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
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
