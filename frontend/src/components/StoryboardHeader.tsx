import React from "react";

interface ProjectData {
  id: string;
  type: number;
  typeName: string;
  userInput: string;
  createdAt: string;
  stories?: string[];
  storyboard?: any;
}

interface StoryboardHeaderProps {
  title?: string;
  description?: string;
  projectData?: ProjectData | null;
}

const StoryboardHeader: React.FC<StoryboardHeaderProps> = ({
  title,
  description,
  projectData,
}) => {
  const displayTitle = title || projectData?.typeName || "Storyboard Project";
  const displayDescription =
    description ||
    `Project created: ${
      projectData?.createdAt
        ? new Date(projectData.createdAt).toLocaleDateString()
        : "Unknown"
    }`;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-foreground">{displayTitle}</h1>
      </div>
      <div className="flex">
        <p className="text-muted-foreground text-sm">{displayDescription}</p>
      </div>
    </div>
  );
};

export default StoryboardHeader;
