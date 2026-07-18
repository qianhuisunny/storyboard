import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
} from "react-router-dom";
import StageLayout from "@/components/StageLayout";
import OnboardingPage from "@/components/OnboardingPage";
import LandingPage from "@/components/LandingPage";
import ProjectsPage from "@/components/ProjectsPage";
import AdminDashboard from "@/components/admin/AdminDashboard";
import GoldSetBench from "@/components/admin/GoldSetBench";
import BatchDiffs from "@/components/admin/BatchDiffs";
import DriftDetailPage from "@/components/admin/drift/DriftDetailPage";
import QualityLogDashboard from "@/components/admin/QualityLogDashboard";
import { BarChart3, FlaskConical } from "lucide-react";
import "./App.css";

function AppHeader() {
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
        <Link
          to="/projects"
          className="text-[13px] font-normal text-[#5A6352] rounded-md transition-all hover:bg-[#EEF1E9] hover:text-[#1C2118] hidden sm:inline-flex"
          style={{ padding: "6px 11px" }}
        >
          My Projects
        </Link>
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
          to="/admin/prompt-bench"
          className="flex items-center gap-1.5 text-[13px] font-normal text-[#5A6352] rounded-md transition-all hover:bg-[#EEF1E9] hover:text-[#1C2118]"
          style={{ padding: "6px 11px" }}
          title="Prompt Bench"
        >
          <FlaskConical className="h-4 w-4" />
          <span className="hidden sm:inline">Bench</span>
        </Link>
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
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route
              path="/storyboard/:projectId"
              element={<StageLayout />}
            />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/prompt-bench" element={<GoldSetBench />} />
            <Route path="/admin/prompt-bench/diffs" element={<BatchDiffs />} />
            <Route path="/admin/drift/:stageName" element={<DriftDetailPage />} />
            <Route path="/admin/quality-log/:projectId?" element={<QualityLogDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
