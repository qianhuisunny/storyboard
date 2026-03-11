/**
 * FindingsDisplay component - Shows grouped research results
 */

import type { FindingsDisplayProps, ResearchFinding } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Package,
  TrendingUp,
  GitBranch,
  BookOpen,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const categoryConfig: Record<
  string,
  { icon: React.ReactNode; title: string; color: string }
> = {
  company: {
    icon: <Building2 className="w-4 h-4" />,
    title: "Company Background",
    color: "bg-[#F5F0EA] text-[#7C6A56]",
  },
  product: {
    icon: <Package className="w-4 h-4" />,
    title: "Product Information",
    color: "bg-[#F5F0EA] text-[#9C8E7C]",
  },
  industry: {
    icon: <TrendingUp className="w-4 h-4" />,
    title: "Industry Context",
    color: "bg-[#EFF5F0] text-[#5E8C61]",
  },
  workflows: {
    icon: <GitBranch className="w-4 h-4" />,
    title: "Typical Workflows",
    color: "bg-[#FBF6ED] text-[#C4963C]",
  },
  terminology: {
    icon: <BookOpen className="w-4 h-4" />,
    title: "Key Terms",
    color: "bg-muted text-muted-foreground",
  },
};

function FindingCard({ finding }: { finding: ResearchFinding }) {
  const confidenceColors = {
    high: "bg-[#EFF5F0] text-[#5E8C61]",
    medium: "bg-[#FBF6ED] text-[#C4963C]",
    low: "bg-[#FBF0ED] text-[#C4644A]",
  };

  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium">{finding.title}</h4>
        <Badge variant="secondary" className={confidenceColors[finding.confidence]}>
          {finding.confidence}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{finding.content}</p>
      {finding.sources.length > 0 && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Sources:</p>
          <div className="flex flex-wrap gap-1">
            {finding.sources.map((source, i) => (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#7C6A56] hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {source.title || "Source"}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySection({
  category,
  findings,
}: {
  category: string;
  findings: ResearchFinding[];
}) {
  const config = categoryConfig[category] || {
    icon: <BookOpen className="w-4 h-4" />,
    title: category,
    color: "bg-muted text-muted-foreground",
  };

  return (
    <AccordionItem value={category}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <span className={`p-1.5 rounded ${config.color}`}>{config.icon}</span>
          <span className="font-medium">{config.title}</span>
          <Badge variant="secondary" className="ml-2">
            {findings.length}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2 pt-2">
          {findings.map((finding, i) => (
            <FindingCard key={i} finding={finding} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function FindingsDisplay({ findings }: FindingsDisplayProps) {
  const categories = ["company", "product", "industry", "workflows", "terminology"];
  const hasFindings = categories.some(
    (cat) => findings[cat as keyof typeof findings] &&
             (findings[cat as keyof typeof findings] as ResearchFinding[]).length > 0
  );

  if (!hasFindings && (!findings.uncertainties || findings.uncertainties.length === 0)) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No research findings available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasFindings && (
        <Accordion type="multiple" defaultValue={["company", "product"]} className="w-full">
          {categories.map((category) => {
            const categoryFindings = findings[category as keyof typeof findings] as ResearchFinding[] | undefined;
            if (!categoryFindings || categoryFindings.length === 0) return null;
            return (
              <CategorySection
                key={category}
                category={category}
                findings={categoryFindings}
              />
            );
          })}
        </Accordion>
      )}

      {findings.uncertainties && findings.uncertainties.length > 0 && (
        <Card className="border-[#C4963C]/30 bg-[#FBF6ED]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-[#C4963C]">
              <AlertTriangle className="w-4 h-4" />
              Uncertainties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[#C4963C] mb-2">
              These items could not be verified and will be excluded from the brief:
            </p>
            <ul className="text-sm space-y-1">
              {findings.uncertainties.map((uncertainty, i) => (
                <li key={i} className="text-[#C4963C]">
                  • {uncertainty}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default FindingsDisplay;
