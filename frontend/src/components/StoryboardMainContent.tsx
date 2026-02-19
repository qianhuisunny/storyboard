import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import StoryboardPanel, { type StoryboardPanelType } from "@/components/StoryboardPanel";

interface StoryboardMainContentProps {
  className?: string;
  panels: StoryboardPanelType[];
  selectedPanelId: string | null;
  onPanelSelect: (panelId: string) => void;
}

export interface StoryboardMainContentRef {
  scrollToPanel: (panelId: string) => void;
}

const StoryboardMainContent = forwardRef<StoryboardMainContentRef, StoryboardMainContentProps>(
  ({ className, panels, selectedPanelId, onPanelSelect }, ref) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const panelRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

    // Function to scroll to a specific panel (make it the first item visible)
    const scrollToPanel = useCallback((panelId: string) => {
      const panelElement = panelRefs.current[panelId];
      const scrollContainer = scrollContainerRef.current;

      if (panelElement && scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const panelRect = panelElement.getBoundingClientRect();
        const scrollTop = scrollContainer.scrollTop;

        // Calculate the position to scroll to (make the panel appear at the top)
        // Add a small offset (20px) for better visual spacing
        const targetScrollTop = scrollTop + panelRect.top - containerRect.top - 20;

        scrollContainer.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });
      }
    }, []);

    // Function to set panel ref
    const setPanelRef = useCallback((panelId: string, element: HTMLDivElement | null) => {
      panelRefs.current[panelId] = element;
    }, []);

    // Expose scrollToPanel function to parent component
    useImperativeHandle(ref, () => ({
      scrollToPanel,
    }), [scrollToPanel]);

    return (
      <div className={cn("flex-1 flex flex-col h-full", className)}>
        {/* Scrollable Content Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ height: '100%' }}
        >
          <div className="space-y-4 p-4 max-w-4xl mx-auto">
            {panels.map((panel, index) => (
              <div
                key={panel.id}
                ref={(element) => setPanelRef(panel.id, element)}
                className="scroll-margin-top-5" // Add scroll margin for better positioning
              >
                <StoryboardPanel
                  panel={panel}
                  index={index}
                  isSelected={selectedPanelId === panel.id}
                  onSelect={onPanelSelect}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

StoryboardMainContent.displayName = "StoryboardMainContent";

export default StoryboardMainContent;