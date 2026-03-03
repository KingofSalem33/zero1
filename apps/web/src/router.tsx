import { createBrowserRouter, Navigate } from "react-router-dom";
import RootLayout from "./layouts/RootLayout";
import ReaderRoute from "./routes/ReaderRoute";
import ChatRoute from "./routes/ChatRoute";
import LibraryRoute from "./routes/LibraryRoute";
import SharedProbeRoute from "./routes/SharedProbeRoute";

// Default redirect: use last position from localStorage or Matthew 1
function getDefaultReaderPath() {
  const book = localStorage.getItem("lastBibleBook") || "Matthew";
  const chapter = localStorage.getItem("lastBibleChapter") || "1";
  return `/read/${book.replace(/ /g, "-")}/${chapter}`;
}

function DefaultRedirect() {
  return <Navigate to={getDefaultReaderPath()} replace />;
}

export const router = createBrowserRouter([
  {
    path: "/ops/shared-probe",
    element: <SharedProbeRoute />,
  },
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <DefaultRedirect />,
      },
      {
        path: "read/:book/:chapter",
        element: <ReaderRoute />,
      },
      {
        path: "chat",
        element: <ChatRoute />,
      },
      {
        path: "chat/:chatId",
        element: <ChatRoute />,
      },
      {
        path: "library",
        element: <LibraryRoute />,
      },
      {
        path: "*",
        element: <DefaultRedirect />,
      },
    ],
  },
]);
