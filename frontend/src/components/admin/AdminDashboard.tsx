/**
 * Admin Dashboard for Plotline Analytics
 *
 * Features:
 * - KPI cards (New Users, Total Projects, Completion Rate, Avg Rating, Avg TTFT)
 * - Time range toggle (7d, 30d, 90d, All)
 * - Performance metrics charts
 * - Completion funnel
 * - User behavior metrics
 * - Field edit patterns for prompt refinement
 * - Satisfaction ratings
 * - Projects table
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users,
  FolderOpen,
  CheckCircle,
  Star,
  Clock,
  RefreshCw,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";

// Types
interface DashboardData {
  time_range: string;
  total_projects: number;
  completed_projects: number;
  completion_rate: number;
  new_registrations: number;
  avg_rating: number;
  rating_distribution: Record<string, number>;
  performance_by_stage: Record<
    string,
    {
      avg_ttft_ms: number | null;
      avg_gen_time_ms: number | null;
      p95_ttft_ms: number | null;
      sample_count: number;
    }
  >;
  behavior_summary: Record<
    string,
    {
      avg_time_seconds: number | null;
      avg_regenerations: number;
      avg_edits: number;
    }
  > & { total_go_backs: number };
  field_edit_patterns: Record<
    string,
    {
      edit_count: number;
      projects_affected: number;
      edit_rate: number;
      samples: Array<{ ai_value: string; human_value: string }>;
    }
  >;
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
  const { user } = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeRange = (searchParams.get("range") as TimeRange) || "30d";

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
              "X-User-Id": user?.id || "",
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
  }, [timeRange, user?.id]);

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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
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
          <div className="grid grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-20 mb-2" />
                <div className="h-8 bg-muted rounded w-16" />
              </Card>
            ))}
          </div>
        ) : data ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <MetricCard
                title="Avg TTFT"
                value={formatMs(
                  data.performance_by_stage?.stage_1?.avg_ttft_ms
                )}
                icon={Clock}
                color="cyan"
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Performance Metrics */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">
                  Performance by Stage
                </h3>
                <div className="space-y-4">
                  {Object.entries(data.performance_by_stage || {}).map(
                    ([stage, metrics]) => (
                      <div key={stage} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="capitalize">
                            {stage.replace("_", " ")}
                          </span>
                          <span className="text-muted-foreground">
                            TTFT: {formatMs(metrics.avg_ttft_ms)} | Gen:{" "}
                            {formatMs(metrics.avg_gen_time_ms)}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.min(
                                ((metrics.avg_ttft_ms || 0) / 5000) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  )}
                </div>
              </Card>

              {/* Completion Funnel */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Completion Funnel</h3>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((stage) => {
                    const count = data.funnel?.[`stage_${stage}`] || 0;
                    const total = data.total_projects || 1;
                    const percentage = Math.round((count / total) * 100);
                    const dropoff =
                      data.funnel?.dropoff_rates?.[`stage_${stage}`] || 0;

                    return (
                      <div key={stage} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Stage {stage}</span>
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
                            className={cn(
                              "h-full rounded transition-all",
                              stage === 1 && "bg-blue-500",
                              stage === 2 && "bg-purple-500",
                              stage === 3 && "bg-green-500",
                              stage === 4 && "bg-yellow-500"
                            )}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Field Edit Patterns */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-2">
                  Field Edit Patterns
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Most frequently edited fields (for prompt refinement)
                </p>
                <div className="space-y-4">
                  {Object.entries(data.field_edit_patterns || {})
                    .slice(0, 5)
                    .map(([field, stats]) => (
                      <div key={field} className="border-b border-border pb-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-sm">{field}</span>
                          <span className="text-xs text-muted-foreground">
                            {stats.edit_rate}% of projects
                          </span>
                        </div>
                        {stats.samples.slice(0, 2).map((sample, i) => (
                          <div
                            key={i}
                            className="text-xs grid grid-cols-2 gap-2 bg-muted/50 rounded p-2 mb-1"
                          >
                            <div>
                              <span className="text-destructive">AI: </span>
                              <span className="text-muted-foreground">
                                {sample.ai_value || "(empty)"}
                              </span>
                            </div>
                            <div>
                              <span className="text-green-600">User: </span>
                              <span>{sample.human_value || "(empty)"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  {Object.keys(data.field_edit_patterns || {}).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No field edits recorded yet
                    </p>
                  )}
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

            {/* Behavior Summary */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">User Behavior</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data.behavior_summary || {})
                  .filter(([key]) => key !== "total_go_backs")
                  .map(([stage, metrics]) => (
                    <div key={stage} className="text-center p-4 bg-muted/50 rounded-lg">
                      <h4 className="text-sm font-medium capitalize mb-2">
                        {stage.replace("_", " ")}
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-lg font-bold">
                            {metrics.avg_time_seconds
                              ? Math.round(metrics.avg_time_seconds)
                              : "-"}
                          </div>
                          <div className="text-muted-foreground">sec</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">
                            {metrics.avg_regenerations?.toFixed(1) || "0"}
                          </div>
                          <div className="text-muted-foreground">regen</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">
                            {metrics.avg_edits?.toFixed(1) || "0"}
                          </div>
                          <div className="text-muted-foreground">edits</div>
                        </div>
                      </div>
                    </div>
                  ))}
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">Go-backs</h4>
                  <div className="text-3xl font-bold">
                    {data.behavior_summary?.total_go_backs || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">total</div>
                </div>
              </div>
            </Card>
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
  color: "blue" | "purple" | "green" | "yellow" | "cyan";
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
    cyan: "bg-cyan-500/10 text-cyan-600",
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

// Helper Functions
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default AdminDashboard;
