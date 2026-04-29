"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchCurrent,
  fetchTimeline,
  type DashboardRequestOptions,
  type CurrentResponse,
  type TimelineResponse,
} from "@/lib/api";

const CURRENT_POLL_INTERVAL = 10 * 1000;
const TIMELINE_POLL_INTERVAL = 30 * 1000;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useDashboard(dashboardId?: string) {
  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const requestOptions = useMemo<DashboardRequestOptions | undefined>(() => {
    return dashboardId ? { dashboardId } : undefined;
  }, [dashboardId]);

  useEffect(() => {
    if (!selectedDate) setSelectedDate(todayStr());
  }, [selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    let requestId = 0;

    const doFetchCurrent = async () => {
      const thisRequest = ++requestId;
      const isActive = () => !controller.signal.aborted && thisRequest === requestId;

      try {
        const cur = await fetchCurrent(controller.signal, requestOptions);
        if (isActive()) {
          setCurrent(cur);
          setViewerCount(cur.viewer_count ?? 0);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (isActive()) {
          setError(e instanceof Error ? e.message : "Failed to fetch data");
          setLoading(false);
        }
      }
    };

    setCurrent(null);
    setTimeline(null);
    setViewerCount(0);
    setLoading(true);
    doFetchCurrent();
    const pollId = setInterval(doFetchCurrent, CURRENT_POLL_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(pollId);
    };
  }, [requestOptions]);

  useEffect(() => {
    if (!selectedDate) return;

    const controller = new AbortController();
    let requestId = 0;

    const doFetchTimeline = async () => {
      const thisRequest = ++requestId;
      try {
        const tl = await fetchTimeline(selectedDate, controller.signal, requestOptions);
        if (!controller.signal.aborted && thisRequest === requestId) {
          setTimeline(tl);
        }
      } catch {
        // Keep stale timeline data if timeline refresh fails.
      }
    };

    doFetchTimeline();
    const pollId = setInterval(doFetchTimeline, TIMELINE_POLL_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(pollId);
    };
  }, [requestOptions, selectedDate]);

  const changeDate = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  return { current, timeline, selectedDate, changeDate, loading, error, viewerCount };
}
