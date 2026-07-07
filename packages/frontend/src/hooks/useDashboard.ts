"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  fetchCurrent,
  fetchTimeline,
  type DashboardRequestOptions,
  type CurrentResponse,
  type TimelineResponse,
} from "@/lib/api";

const POLL_INTERVAL = 10 * 1000; // 10 seconds

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
  const firstLoad = useRef(true);
  const requestOptions = useMemo<DashboardRequestOptions | undefined>(() => {
    return dashboardId ? { dashboardId } : undefined;
  }, [dashboardId]);

  useEffect(() => {
    if (!selectedDate) setSelectedDate(todayStr());
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;

    const controller = new AbortController();
    let requestId = 0;

    const doFetch = async () => {
      const thisRequest = ++requestId;
      try {
        setError(null);
        if (firstLoad.current) setLoading(true);
        const [cur, tl] = await Promise.all([
          fetchCurrent(controller.signal, requestOptions),
          fetchTimeline(selectedDate, controller.signal, requestOptions),
        ]);
        if (!controller.signal.aborted && thisRequest === requestId) {
          setCurrent(cur);
          setTimeline(tl);
          setViewerCount(cur.viewer_count ?? 0);
          firstLoad.current = false;
        }
      } catch (e) {
        if (!controller.signal.aborted && thisRequest === requestId) {
          setError(e instanceof Error ? e.message : "Failed to fetch data");
        }
      } finally {
        if (!controller.signal.aborted && thisRequest === requestId) {
          setLoading(false);
        }
      }
    };

    firstLoad.current = true;
    doFetch();
    const pollId = setInterval(doFetch, POLL_INTERVAL);

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
