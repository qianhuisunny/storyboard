import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import {
  Plus,
  Loader2,
  Film,
  BookOpen,
  Lightbulb,
  Trash2,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  typeName: string;
  userInput: string;
  createdAt: string;
  lastUpdated: string;
  currentStage: number;
  progress: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  "Product Release": <Film className="w-5 h-5" />,
  "How-to Video": <BookOpen className="w-5 h-5" />,
  "Knowledge Sharing": <Lightbulb className="w-5 h-5" />,
};

const TYPE_COLORS: Record<string, string> = {
  "Product Release": "bg-blue-100 text-blue-700",
  "How-to Video": "bg-green-100 text-green-700",
  "Knowledge Sharing": "bg-purple-100 text-purple-700",
};

const STAGE_NAMES = ["", "Video Briefing", "Video Outline", "Storyboard Draft", "Review and Share"];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      if (!isLoaded || !user?.id) return;

      try {
        const response = await fetch(`/api/projects?user_id=${user.id}`);
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [user?.id, isLoaded]);

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;

    if (!confirm("Are you sure you want to delete this project?")) return;

    setDeletingId(projectId);
    try {
      const response = await fetch(
        `/api/project/${projectId}?user_id=${user.id}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleProjectClick = (projectId: string) => {
    navigate(`/storyboard/${projectId}`);
  };

  const handleNewProject = () => {
    navigate("/onboarding");
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Projects</h1>
            <p className="text-muted-foreground mt-1">
              Continue working on your video storyboards
            </p>
          </div>
          <Button onClick={handleNewProject} className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && projects.length === 0 && (
          <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed border-border">
            <Film className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first video storyboard project to get started with AI-powered content creation.
            </p>
            <Button onClick={handleNewProject} size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              Create Your First Project
            </Button>
          </div>
        )}

        {/* Projects Grid */}
        {!isLoading && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                className={cn(
                  "group relative bg-card border border-border rounded-xl p-5",
                  "hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer"
                )}
              >
                {/* Type Badge */}
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium",
                      TYPE_COLORS[project.typeName] || "bg-gray-100 text-gray-700"
                    )}
                  >
                    {TYPE_ICONS[project.typeName] || <Film className="w-4 h-4" />}
                    <span>{project.typeName}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    disabled={deletingId === project.id}
                    className={cn(
                      "p-1.5 rounded-lg opacity-0 group-hover:opacity-100",
                      "text-muted-foreground hover:text-red-500 hover:bg-red-50",
                      "transition-all"
                    )}
                    title="Delete project"
                  >
                    {deletingId === project.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Project Title/Description */}
                <h3 className="font-medium text-foreground mb-2 line-clamp-2">
                  {truncateText(project.userInput, 80)}
                </h3>

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>
                      Stage {project.currentStage}: {STAGE_NAMES[project.currentStage] || "Unknown"}
                    </span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(project.lastUpdated || project.createdAt)}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
