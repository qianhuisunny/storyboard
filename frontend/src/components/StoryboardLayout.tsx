import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StoryboardEditor from "@/components/StoryboardEditor";
import EnhancedChatbot from "@/components/EnhancedChatbot";
import StoryboardHeader from "@/components/StoryboardHeader";
import { Loader2 } from "lucide-react";

interface Story {
  screen_name?: string;
  Screen_title?: string;
  Type?: string;
  voiceover_text?: string;
  screen_type?: string;
  target_duration_sec?: number;
  action_notes?: string;
  screen_number?: number;
  on_screen_visual_keywords?: string;
  image_url?: string;
  [key: string]: any;
}

interface ProjectData {
  id: string;
  type: number;
  typeName: string;
  userInput: string;
  createdAt: string;
  stories?: string[];
  storyboard?: any;
}

const StoryboardLayout: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjectData = async () => {
      if (!projectId) {
        setError("No project ID provided");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/project/${projectId}`
        );

        if (!response.ok) {
          if (response.status === 404) {
            setError("Project not found");
          } else {
            throw new Error("Failed to load project");
          }
          return;
        }

        const data = await response.json();
        setProjectData(data.project);
        setStories(data.stories || []);

        // Update sessionStorage with project context for chatbot
        sessionStorage.setItem("projectId", projectId);
        if (data.project.type) {
          sessionStorage.setItem(
            "storyboardType",
            data.project.type.toString()
          );
        }
        if (data.project.userInput) {
          sessionStorage.setItem("storyboardPrompt", data.project.userInput);
        }
      } catch (error) {
        console.error("Error loading project:", error);
        setError("Failed to load project data");
      } finally {
        setIsLoading(false);
      }
    };

    loadProjectData();
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading project...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    // left side is the story editor and right side is the chatbot
    // add some padding between the soryboard editor and chatbot
    <div className="h-full w-full flex overflow-hidden">
      <div className="flex w-3/4 flex-col h-full overflow-hidden">
        <div className="flex-shrink-0 bg-background border-b border-border p-4">
          <StoryboardHeader projectData={projectData} />
        </div>
        <div className="flex flex-1 min-h-0 pt-4 px-4 overflow-hidden">
          <StoryboardEditor className="h-full" stories={stories} />
        </div>
      </div>
      <div className="w-1/4 h-full">
        <EnhancedChatbot />
      </div>
    </div>
  );
};

export default StoryboardLayout;
