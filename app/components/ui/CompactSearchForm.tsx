import { useNavigate } from "react-router";

interface CompactSearchFormProps {
  isHomepage?: boolean;
}

export function CompactSearchForm({ isHomepage = false }: CompactSearchFormProps) {
  const navigate = useNavigate();

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get("q") as string;
    if (query && query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative">
      <div className="relative">
        <input
          type="text"
          name="q"
          placeholder="Search..."
          className={`w-64 px-4 py-2 text-sm rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 ${
            isHomepage
              ? "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-purple-500"
              : "bg-white/10 border-white/20 text-white placeholder-white/70 focus:ring-white/30 focus:bg-white/20"
          }`}
        />
        <button
          type="submit"
          className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors ${
            isHomepage
              ? "text-gray-400 hover:text-purple-600"
              : "text-white/70 hover:text-white"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>
  );
}