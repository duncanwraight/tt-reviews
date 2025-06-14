import { Link } from "react-router";

interface PlayersPaginationProps {
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
  };
  filters: {
    country?: string;
    playingStyle?: string;
    activeOnly?: boolean;
    sortBy: string;
    sortOrder: string;
  };
}

export function PlayersPagination({ pagination, filters }: PlayersPaginationProps) {
  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    
    if (filters.country) params.set("country", filters.country);
    if (filters.playingStyle) params.set("style", filters.playingStyle);
    if (filters.activeOnly !== undefined) params.set("active", filters.activeOnly.toString());
    if (filters.sortBy !== "created_at") params.set("sort", filters.sortBy);
    if (filters.sortOrder !== "desc") params.set("order", filters.sortOrder);
    if (page !== 1) params.set("page", page.toString());
    
    return `/players?${params.toString()}`;
  };

  if (pagination.totalPages <= 1) {
    return null;
  }

  const { currentPage, totalPages } = pagination;
  const pages = [];

  // Always show first page
  if (currentPage > 3) {
    pages.push(1);
    if (currentPage > 4) {
      pages.push("...");
    }
  }

  // Show pages around current page
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    pages.push(i);
  }

  // Always show last page
  if (currentPage < totalPages - 2) {
    if (currentPage < totalPages - 3) {
      pages.push("...");
    }
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center space-x-2 mt-8">
      {/* Previous button */}
      {currentPage > 1 && (
        <Link
          to={buildPageUrl(currentPage - 1)}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700"
        >
          Previous
        </Link>
      )}

      {/* Page numbers */}
      {pages.map((page, index) => {
        if (page === "...") {
          return (
            <span key={`ellipsis-${index}`} className="px-3 py-2 text-sm font-medium text-gray-700">
              ...
            </span>
          );
        }

        const pageNum = page as number;
        const isCurrentPage = pageNum === currentPage;

        return (
          <Link
            key={pageNum}
            to={buildPageUrl(pageNum)}
            className={`px-3 py-2 text-sm font-medium border rounded-md ${
              isCurrentPage
                ? "bg-purple-600 text-white border-purple-600"
                : "text-gray-500 bg-white border-gray-300 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {pageNum}
          </Link>
        );
      })}

      {/* Next button */}
      {currentPage < totalPages && (
        <Link
          to={buildPageUrl(currentPage + 1)}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700"
        >
          Next
        </Link>
      )}
    </div>
  );
}