import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
} from "react-router-dom";
import {
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import StageLayout from "@/components/StageLayout";
import OnboardingPage from "@/components/OnboardingPage";
import LandingPage from "@/components/LandingPage";
import ProjectsPage from "@/components/ProjectsPage";
import ThemeToggle from "@/components/ThemeToggle";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { BarChart3 } from "lucide-react";
import "./App.css";

// Check if user has admin role (set in Clerk public metadata)
function useIsAdmin() {
  const { user } = useUser();
  // In development, check for admin role or allow if no role is set
  const isAdmin = user?.publicMetadata?.role === "admin" ||
    import.meta.env.DEV; // Allow in dev mode for testing
  return isAdmin;
}

function AppHeader() {
  const isAdmin = useIsAdmin();

  return (
    <header className="bg-[var(--header-background)] text-[var(--header-foreground)] border-b border-[var(--header-border)] px-4 py-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
          <h1 className="text-xl font-semibold">
            Plotline
          </h1>
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-[10px]">
            Beta
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-80 hidden sm:inline">
            AI-Powered Storyboard Generator
          </span>
          <ThemeToggle />
          <SignedIn>
            <Link
              to="/projects"
              className="text-sm hover:opacity-80 transition-opacity hidden sm:inline"
            >
              My Projects
            </Link>
            {isAdmin && (
              <Link
                to="/admin/dashboard"
                className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity"
                title="Admin Dashboard"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </Link>
            )}
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <Router>
      <div className="h-screen flex flex-col">
        {/* Global Header - Cal.com inverted style */}
        <AppHeader />

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <SignedOut>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SignedOut>

          <SignedIn>
            <Routes>
              <Route path="/" element={<OnboardingPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route
                path="/storyboard/:projectId"
                element={<StageLayout />}
              />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SignedIn>
        </div>
      </div>
    </Router>
  );
}

export default App;
