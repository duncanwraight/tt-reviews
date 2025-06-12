import { SearchForm } from "../ui/SearchForm";

export function HeroSection() {
  return (
    <section className="relative bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white py-24">
      <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          Table Tennis Equipment Reviews
        </h1>
        <p className="text-xl md:text-2xl mb-8 text-purple-100">
          Discover the gear that powers professional players
        </p>
        
        <SearchForm className="max-w-2xl mx-auto" />
      </div>
    </section>
  );
}