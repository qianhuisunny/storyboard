/**
 * Admin Dashboard for Plotline Analytics
 *
 * Features:
 * - KPI cards (New Users, Total Projects, Completion Rate, Avg Rating)
 * - Time range toggle (7d, 30d, 90d, All)
 * - Completion funnel
 * - Satisfaction ratings
 */

import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users,
  FolderOpen,
  CheckCircle,
  Star,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { getAnonymousUserId } from "@/lib/anonymousUser";

// Types
interface DashboardData {
  time_range: string;
  total_projects: number;
  completed_projects: number;
  completion_rate: number;
  new_registrations: number;
  avg_rating: number;
  rating_distribution: Record<string, number>;
  funnel: Record<string, number> & { dropoff_rates: Record<string, number> };
  recent_feedback: Array<{
    project_id: string;
    rating: number;
    feedback: string;
    submitted_at: string;
  }>;
}

type TimeRange = "7d" | "30d" | "90d" | "all";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "all", label: "All Time" },
];

export function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [userId] = useState(() => getAnonymousUserId());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeRange = (searchParams.get("range") as TimeRange) || "30d";

  const navigate = useNavigate();
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [qualityStats, setQualityStats] = useState<{
    pass_rate: number;
    retry_rate: number;
    avg_score: number;
    total_evals: number;
    total_projects: number;
  } | null>(null);

  const setTimeRange = (range: TimeRange) => {
    setSearchParams({ range });
  };

  // Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/analytics/dashboard?range=${timeRange}`,
          {
            headers: {
              "X-User-Id": userId,
            },
          }
        );

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error("Access denied. Admin privileges required.");
          }
          throw new Error("Failed to load dashboard data");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange, userId]);

  useEffect(() => {
    fetch("/api/quality-log/stats/summary")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setQualityStats(d))
      .catch(() => {});
  }, []);

  const handleRefresh = () => {
    setData(null);
    setLoading(true);
    // Trigger refetch
    const event = new Event("refetch");
    window.dispatchEvent(event);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">Analytics Dashboard</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Time Range Toggle */}
              <div className="flex items-center bg-muted rounded-lg p-1">
                {TIME_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTimeRange(option.value)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                      timeRange === option.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {loading && !data ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-20 mb-2" />
                <div className="h-8 bg-muted rounded w-16" />
              </Card>
            ))}
          </div>
        ) : data ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="New Users"
                value={data.new_registrations}
                icon={Users}
                color="blue"
              />
              <MetricCard
                title="Total Projects"
                value={data.total_projects}
                icon={FolderOpen}
                color="purple"
              />
              <MetricCard
                title="Completed"
                value={`${Math.round(data.completion_rate * 100)}%`}
                subtitle={`${data.completed_projects} projects`}
                icon={CheckCircle}
                color="green"
              />
              <MetricCard
                title="Avg Rating"
                value={data.avg_rating.toFixed(1)}
                icon={Star}
                color="yellow"
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Completion Funnel */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Completion Funnel</h3>
                <div className="space-y-3">
                  {[
                    { key: 1, label: "Briefing", color: "bg-blue-500", diffable: false },
                    { key: 2, label: "Outline", color: "bg-purple-500", diffable: true, route: "outline" },
                    { key: 3, label: "Evidence Research", color: "bg-green-500", diffable: false },
                    { key: 4, label: "Storyboard Draft", color: "bg-yellow-500", diffable: true, route: "storyboard" },
                    { key: 5, label: "Review & Share", color: "bg-orange-500", diffable: false },
                  ].map(({ key: stage, label, color, diffable, route }) => {
                    const count = data.funnel?.[`stage_${stage}`] || 0;
                    const total = data.total_projects || 1;
                    const percentage = Math.round((count / total) * 100);
                    const dropoff =
                      data.funnel?.dropoff_rates?.[`stage_${stage}`] || 0;
                    const isExpanded = expandedStage === stage;

                    return (
                      <div key={stage}>
                        <div
                          className={cn("space-y-1", diffable && "cursor-pointer")}
                          onClick={() => diffable && setExpandedStage(isExpanded ? null : stage)}
                        >
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1">
                              {diffable && (
                                <span className="text-xs text-muted-foreground">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              )}
                              {label}
                            </span>
                            <span className="text-muted-foreground">
                              {count} ({percentage}%)
                              {dropoff > 0 && (
                                <span className="text-destructive ml-2">
                                  -{dropoff}% drop
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-6 bg-muted rounded overflow-hidden">
                            <div
                              className={cn("h-full rounded transition-all", color)}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        {/* Accordion panel */}
                        {isExpanded && diffable && (
                          <div className="mt-2 mb-1 bg-[#fafaf8] border border-border rounded-md px-3 py-2.5 flex justify-between items-center">
                            <div className="text-xs text-muted-foreground">
                              <strong className="text-foreground">{count}</strong> projects reached this stage
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/drift/${route}`);
                              }}
                              className="text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
                            >
                              View all diffs →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Satisfaction Ratings */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">
                  Satisfaction Ratings
                </h3>
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const count = data.rating_distribution?.[star] || 0;
                    const total = Object.values(
                      data.rating_distribution || {}
                    ).reduce((a, b) => a + b, 0);
                    const percentage = total
                      ? Math.round((count / total) * 100)
                      : 0;

                    return (
                      <div key={star} className="flex-1">
                        <div className="text-center mb-1">
                          <div className="text-lg font-bold">{count}</div>
                          <div className="flex justify-center">
                            {[...Array(star)].map((_, i) => (
                              <Star
                                key={i}
                                className="h-3 w-3 fill-yellow-400 text-yellow-400"
                              />
                            ))}
                          </div>
                        </div>
                        <div className="h-16 bg-muted rounded-t flex flex-col justify-end">
                          <div
                            className="bg-yellow-400 rounded-t"
                            style={{ height: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recent Feedback */}
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-medium">Recent Feedback</h4>
                  {data.recent_feedback?.slice(0, 3).map((fb, i) => (
                    <div
                      key={i}
                      className="text-sm p-2 bg-muted/50 rounded flex gap-2"
                    >
                      <div className="flex shrink-0">
                        {[...Array(fb.rating)].map((_, j) => (
                          <Star
                            key={j}
                            className="h-3 w-3 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-muted-foreground line-clamp-2">
                        {fb.feedback}
                      </p>
                    </div>
                  ))}
                  {(!data.recent_feedback ||
                    data.recent_feedback.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No feedback yet
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {/* AI Quality Gate */}
            {qualityStats && qualityStats.total_evals > 0 && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/10">
                      <ShieldCheck className="h-4 w-4 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold">AI Quality Gate</h3>
                  </div>
                  <button
                    onClick={() => navigate("/admin/quality-log")}
                    className="text-xs font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
                  >
                    View Quality Log →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className={cn(
                      "text-2xl font-bold",
                      qualityStats.pass_rate >= 0.7 ? "text-[#3A6B47]" : qualityStats.pass_rate >= 0.5 ? "text-[#946B2D]" : "text-destructive",
                    )}>
                      {Math.round(qualityStats.pass_rate * 100)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Pass rate</div>
                  </div>
                  <div className="text-center">
                    <div className={cn(
                      "text-2xl font-bold",
                      qualityStats.retry_rate <= 0.3 ? "text-[#3A6B47]" : qualityStats.retry_rate <= 0.5 ? "text-[#946B2D]" : "text-destructive",
                    )}>
                      {Math.round(qualityStats.retry_rate * 100)}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Retry rate</div>
                  </div>
                  <div className="text-center">
                    <div className={cn(
                      "text-2xl font-bold",
                      qualityStats.avg_score >= 7.0 ? "text-[#3A6B47]" : qualityStats.avg_score >= 6.0 ? "text-[#946B2D]" : "text-destructive",
                    )}>
                      {qualityStats.avg_score.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Avg score</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  {qualityStats.total_evals} evals across {qualityStats.total_projects} projects
                </p>
              </Card>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

// Helper Components
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: "blue" | "purple" | "green" | "yellow";
  trend?: { value: number; isPositive: boolean };
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
}: MetricCardProps) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600",
    purple: "bg-purple-500/10 text-purple-600",
    green: "bg-green-500/10 text-green-600",
    yellow: "bg-yellow-500/10 text-yellow-600",
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
          {trend && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs mt-1",
                trend.isPositive ? "text-green-600" : "text-destructive"
              )}
            >
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.value}%
            </div>
          )}
        </div>
        <div className={cn("p-2 rounded-lg", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default AdminDashboard;
