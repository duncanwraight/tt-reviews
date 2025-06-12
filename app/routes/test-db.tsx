import type { Route } from "./+types/test-db";
import { DatabaseService } from "~/lib/database.server";

export async function loader({ context }: Route.LoaderArgs) {
  try {
    const db = new DatabaseService(context);
    
    // Get environment info
    const env = context.cloudflare.env as Record<string, string>;
    const supabaseUrl = env.SUPABASE_URL;
    const environment = env.ENVIRONMENT;
    
    // Test basic database connectivity
    const [equipment, players] = await Promise.all([
      db.getRecentEquipment(3),
      db.getAllPlayers()
    ]);

    return {
      success: true,
      environment: {
        supabaseUrl,
        environment,
        isLocal: supabaseUrl?.includes('tt-reviews.local') || supabaseUrl?.includes('127.0.0.1')
      },
      data: {
        equipmentCount: equipment.length,
        equipment: equipment.slice(0, 3),
        playersCount: players.length,
        players: players.slice(0, 3)
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Database test error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

export default function TestDatabase({ loaderData }: Route.ComponentProps) {
  const { success, data, error, timestamp, environment } = loaderData;

  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "800px" }}>
      <h1>Database Connection Test</h1>
      <p><strong>Status:</strong> {success ? "✅ Connected" : "❌ Failed"}</p>
      <p><strong>Timestamp:</strong> {timestamp}</p>
      
      {environment && (
        <div style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px", marginTop: "1rem" }}>
          <h3>Environment Info:</h3>
          <p><strong>Environment:</strong> {environment.environment}</p>
          <p><strong>Supabase URL:</strong> {environment.supabaseUrl}</p>
          <p><strong>Using Local DB:</strong> {environment.isLocal ? "✅ Yes" : "❌ No (Production)"}</p>
        </div>
      )}
      
      {error && (
        <div style={{ background: "#ffebee", padding: "1rem", borderRadius: "4px", marginTop: "1rem" }}>
          <h3>Error:</h3>
          <pre>{error}</pre>
        </div>
      )}
      
      {success && data && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Database Contents:</h2>
          
          <div style={{ marginBottom: "2rem" }}>
            <h3>Equipment ({data.equipmentCount} total)</h3>
            {data.equipment.length > 0 ? (
              <ul>
                {data.equipment.map((item: any) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong> by {item.manufacturer} 
                    <span style={{ color: "#666" }}> ({item.category})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "#666" }}>No equipment found</p>
            )}
          </div>

          <div>
            <h3>Players ({data.playersCount} total)</h3>
            {data.players.length > 0 ? (
              <ul>
                {data.players.map((player: any) => (
                  <li key={player.id}>
                    <strong>{player.name}</strong>
                    {player.highest_rating && <span style={{ color: "#666" }}> (Rating: {player.highest_rating})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "#666" }}>No players found</p>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: "3rem", fontSize: "0.9em", color: "#666" }}>
        <p><strong>Note:</strong> This route tests the React Router v7 database service integration.</p>
        <p>If successful, it shows we can connect to Supabase and query data using the new architecture.</p>
      </div>
    </div>
  );
}