import type { Route } from "./+types/admin.player-edits";
import { data } from "react-router";
import { createSupabaseClient } from "~/lib/database.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Player Edits | Admin | TT Reviews" },
    { name: "description", content: "Review and moderate player edit submissions." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const supabase = createSupabaseClient(context);

  const { data: playerEdits, error } = await supabase
    .from('player_edits')
    .select(`
      *,
      players (
        id,
        name,
        slug
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching player edits:', error);
    return data({ playerEdits: [] });
  }

  return data({ playerEdits: playerEdits || [] });
}

export default function AdminPlayerEdits({ loaderData }: Route.ComponentProps) {
  const { playerEdits } = loaderData;

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'awaiting_second_approval':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatEditData = (editData: any) => {
    return Object.entries(editData).map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `${label}: ${value}`;
    }).join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Player Edits</h2>
        <div className="text-sm text-gray-600">
          {playerEdits.length} total edits
        </div>
      </div>

      {playerEdits.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✏️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No edits found</h3>
          <p className="text-gray-600">No player edits to review at this time.</p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden rounded-md">
          <ul className="divide-y divide-gray-200">
            {playerEdits.map((edit) => (
              <li key={edit.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">👤</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Edit for {edit.players?.name || 'Unknown Player'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Changes: {formatEditData(edit.edit_data)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={getStatusBadge(edit.status)}>
                        {edit.status.replace(/_/g, ' ')}
                      </span>
                      <div className="text-sm text-gray-500">
                        {new Date(edit.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 bg-gray-50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Proposed Changes:</h4>
                    <div className="space-y-1">
                      {Object.entries(edit.edit_data).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium text-gray-700">
                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                          </span>
                          <span className="ml-2 text-gray-900">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {edit.moderator_notes && (
                    <div className="mt-2 text-sm">
                      <strong className="text-gray-700">Moderator Notes:</strong>
                      <p className="text-gray-600 mt-1">{edit.moderator_notes}</p>
                    </div>
                  )}

                  <div className="mt-3 flex items-center space-x-3">
                    {edit.status === 'pending' && (
                      <>
                        <button 
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          onClick={() => {/* TODO: Implement approve action */}}
                        >
                          Approve
                        </button>
                        <button 
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          onClick={() => {/* TODO: Implement reject action */}}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {edit.players?.slug && (
                      <a
                        href={`/players/${edit.players.slug}`}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                      >
                        View Player
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}