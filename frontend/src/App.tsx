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
import AdminDashboard from "@/components/admin/AdminDashboard";
import GoldSetEval from "@/components/admin/GoldSetEval";
import BatchDiffs from "@/components/admin/BatchDiffs";
import { BarChart3, FlaskConical } from "lucide-react";
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
    <header className="bg-[var(--header-background)] text-[var(--header-foreground)] border-b border-[var(--header-border)] flex-shrink-0 flex items-center justify-between" style={{ height: "54px", padding: "0 22px" }}>
      <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
        <h1 className="text-[20px] text-[#3A6B47]" style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, letterSpacing: "-0.3px" }}>
          Plotline
        </h1>
        <span className="text-[9.5px] font-semibold text-[#626B58] bg-white border border-[#D9DDD2] rounded uppercase relative -top-px" style={{ padding: "2px 6px", letterSpacing: "0.6px" }}>
          Research Preview
        </span>
      </Link>
      <div className="flex items-center gap-4">
        <SignedIn>
          <Link
            to="/projects"
            className="text-[13px] font-normal text-[#5A6352] rounded-md transition-all hover:bg-[#EEF1E9] hover:text-[#1C2118] hidden sm:inline-flex"
            style={{ padding: "6px 11px" }}
          >
            My Projects
          </Link>
          {isAdmin && (
            <>
              <Link
                to="/admin/dashboard"
                className="flex items-center gap-1.5 text-[13px] font-normal text-[#5A6352] rounded-md transition-all hover:bg-[#EEF1E9] hover:text-[#1C2118]"
                style={{ padding: "6px 11px" }}
                title="Admin Dashboard"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analytics</span>
              </Link>
              <Link
                to="/admin/gold-set-eval"
                className="flex items-center gap-1.5 text-[13px] font-normal text-[#5A6352] rounded-md transition-all hover:bg-[#EEF1E9] hover:text-[#1C2118]"
                style={{ padding: "6px 11px" }}
                title="Gold Set Eval"
              >
                <FlaskConical className="h-4 w-4" />
                <span className="hidden sm:inline">Eval</span>
              </Link>
            </>
          )}
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </div>
    </header>
  );
}

function App() {
  return (
    <Router>
      <div className="h-screen flex flex-col">
        {/* Global Header */}
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
              <Route path="/admin/gold-set-eval" element={<GoldSetEval />} />
              <Route path="/admin/gold-set-eval/diffs" element={<BatchDiffs />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SignedIn>
        </div>
      </div>
    </Router>
  );
}

export default App;
