import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchMessage = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/hello`,
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setMessage(data.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    };

    fetchMessage();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Zero1 Monorepo
        </h1>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">
              API Integration
            </h2>
            {loading && (
              <p className="text-blue-700">Loading message from API...</p>
            )}
            {error && <p className="text-red-600">Error: {error}</p>}
            {message && !loading && (
              <p className="text-green-700 font-medium">{message}</p>
            )}
          </div>

          <div className="text-sm text-gray-600 text-center">
            <p>React + TypeScript + Vite</p>
            <p>Connected to Express API</p>
          </div>

          <footer className="text-xs text-gray-500 text-center mt-4">
            Built with ❤️ using the Zero1 monorepo
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
