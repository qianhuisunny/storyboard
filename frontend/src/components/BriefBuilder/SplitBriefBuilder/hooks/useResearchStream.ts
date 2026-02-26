/**
 * useResearchStream hook - SSE connection for research streaming
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { SearchEvent, ResearchFindings, SSEEventType } from "../types";

interface UseResearchStreamOptions {
  projectId: string;
  enabled: boolean;
  onSearchStarted: (event: SearchEvent) => void;
  onSearchComplete: (id: string, resultsCount?: number) => void;
  onSearchError: (id: string) => void;
  onResearchComplete: (findings: ResearchFindings) => void;
  onError: (error: string) => void;
}

interface UseResearchStreamReturn {
  isConnected: boolean;
  startResearch: () => void;
  stopResearch: () => void;
}

export function useResearchStream({
  projectId,
  enabled,
  onSearchStarted,
  onSearchComplete,
  onSearchError,
  onResearchComplete,
  onError,
}: UseResearchStreamOptions): UseResearchStreamReturn {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !projectId) return;

    cleanup();

    const url = `/api/project/${projectId}/research/stream`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type as SSEEventType;

        switch (eventType) {
          case "search_started":
            onSearchStarted({
              id: data.id || crypto.randomUUID(),
              query: data.query,
              purpose: data.purpose || "Searching...",
              status: "started",
              timestamp: data.timestamp || new Date().toISOString(),
            });
            break;

          case "search_complete":
            onSearchComplete(data.id, data.results_count);
            break;

          case "search_error":
            onSearchError(data.id);
            break;

          case "research_complete":
            onResearchComplete(data.findings);
            cleanup();
            break;

          case "error":
            onError(data.message || "An error occurred during research");
            cleanup();
            break;

          case "heartbeat":
            // Keep-alive, no action needed
            break;

          default:
            console.warn("Unknown SSE event type:", eventType);
        }
      } catch (err) {
        console.error("Error parsing SSE message:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      setIsConnected(false);

      // Attempt reconnection
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        onError("Connection lost. Please try again.");
        cleanup();
      }
    };
  }, [
    projectId,
    enabled,
    cleanup,
    onSearchStarted,
    onSearchComplete,
    onSearchError,
    onResearchComplete,
    onError,
  ]);

  const startResearch = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  const stopResearch = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    startResearch,
    stopResearch,
  };
}

/**
 * Fallback hook for when SSE is not available
 * Uses polling instead
 */
export function useResearchPolling({
  projectId,
  enabled,
  onResearchComplete,
  onError,
}: {
  projectId: string;
  enabled: boolean;
  onResearchComplete: (findings: ResearchFindings) => void;
  onError: (error: string) => void;
}) {
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isPolling, setIsPolling] = useState(false);

  const startPolling = useCallback(async () => {
    if (!enabled || !projectId) return;

    setIsPolling(true);

    // Initial request to start research
    try {
      const response = await fetch(`/api/project/${projectId}/research/start`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to start research");
      }
    } catch (err) {
      onError("Failed to start research");
      setIsPolling(false);
      return;
    }

    // Poll for status
    intervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/project/${projectId}/research/status`);
        const data = await response.json();

        if (data.status === "complete") {
          onResearchComplete(data.findings);
          stopPolling();
        } else if (data.status === "error") {
          onError(data.error || "Research failed");
          stopPolling();
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  }, [projectId, enabled, onResearchComplete, onError]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isPolling,
    startPolling,
    stopPolling,
  };
}

export default useResearchStream;
