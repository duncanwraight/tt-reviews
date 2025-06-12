import { useNavigate } from "react-router";

interface SearchFormProps {
  placeholder?: string;
  className?: string;
}

export function SearchForm({ 
  placeholder = "Search equipment, players, or brands...",
  className = ""
}: SearchFormProps) {
  const navigate = useNavigate();

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get('q') as string;
    if (query && query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className={className}>
      <div className="relative">
        <input
          type="text"
          name="q"
          placeholder={placeholder}
          className="w-full px-6 py-4 text-lg rounded-full border-0 shadow-xl focus:ring-4 focus:ring-purple-300 focus:outline-none text-gray-900 placeholder-gray-500"
        />
        <button
          type="submit"
          className="absolute right-2 top-2 bottom-2 px-8 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          Search
        </button>
      </div>
    </form>
  );
}