interface User {
  id: string;
  email?: string;
  created_at: string;
}

interface ProfileInfoProps {
  user: User;
}

export function ProfileInfo({ user }: ProfileInfoProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Account Information
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="text-gray-900">{user.email || "Not provided"}</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Member Since
          </label>
          <div className="text-gray-900">{formatDate(user.created_at)}</div>
        </div>
      </div>
    </div>
  );
}
