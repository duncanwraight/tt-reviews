import { Navigation } from "../ui/Navigation";
import { Footer } from "../ui/Footer";

interface User {
  id: string;
  email?: string;
  role?: string;
}

interface PageLayoutProps {
  user?: User | null;
  children: React.ReactNode;
}

export function PageLayout({ user, children }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation user={user} />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
