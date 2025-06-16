import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { createBrowserClient } from "@supabase/ssr";
import type { Route } from "./+types/auth.confirm";
import { Navigation } from "~/components/ui/Navigation";
import { Footer } from "~/components/ui/Footer";
import { data } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Email Confirmation | TT Reviews" },
    {
      name: "description",
      content: "Email confirmation for TT Reviews account",
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

export default function AuthConfirm({ loaderData }: Route.ComponentProps) {
  const { env } = loaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const confirmEmail = async () => {
      const token_hash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (!token_hash || !type) {
        setStatus('error');
        setMessage('Invalid confirmation link. Please try signing up again.');
        return;
      }

      const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as any,
        });

        if (error) {
          setStatus('error');
          setMessage(error.message);
        } else {
          setStatus('success');
          setMessage('Your email has been confirmed! You can now sign in to your account.');
          
          // Redirect to login page after 3 seconds
          setTimeout(() => {
            navigate('/login');
          }, 3000);
        }
      } catch (error) {
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
      }
    };

    confirmEmail();
  }, [searchParams, env, navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            {status === 'loading' && (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Confirming Your Email
                </h1>
                <p className="text-gray-600">
                  Please wait while we confirm your email address...
                </p>
              </>
            )}
            
            {status === 'success' && (
              <>
                <span className="text-6xl mb-4 block">✅</span>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Email Confirmed!
                </h1>
                <p className="text-gray-600 mb-4">
                  {message}
                </p>
                <p className="text-sm text-gray-500">
                  Redirecting to login page in 3 seconds...
                </p>
              </>
            )}
            
            {status === 'error' && (
              <>
                <span className="text-6xl mb-4 block">❌</span>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  Confirmation Failed
                </h1>
                <p className="text-gray-600 mb-6">
                  {message}
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] shadow-lg"
                  >
                    Go to Login
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02]"
                  >
                    Back to Homepage
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}