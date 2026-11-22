"use client";

import { useEffect, useState, useRef } from "react";
import { ref, onValue, query, orderByChild, limitToLast } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale
);

interface HistoryEntry {
  value: number;
  timestamp: number;
}

interface RealtimeChartProps {
  uid: string;
  deviceId: string;
  vpin: string;
  widgetId: string;
  unit?: string;
  timeRange: "Live" | "1h" | "1d" | "1w" | "1mo";
  simulatedData?: HistoryEntry[];
}

function getTimeRangeMs(range: string): number {
  switch (range) {
    case "Live": return 5 * 60 * 1000;
    case "1h": return 60 * 60 * 1000;
    case "1d": return 24 * 60 * 60 * 1000;
    case "1w": return 7 * 24 * 60 * 60 * 1000;
    case "1mo": return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

function getTimeUnit(range: string): "second" | "minute" | "hour" | "day" | "week" | "month" {
  switch (range) {
    case "Live": return "second";
    case "1h": return "minute";
    case "1d": return "hour";
    case "1w": return "day";
    case "1mo": return "day";
    default: return "hour";
  }
}

function getTimeDisplayFormats(range: string): string {
  switch (range) {
    case "Live": return "HH:mm:ss";
    case "1h": return "HH:mm";
    case "1d": return "HH:mm";
    case "1w": return "EEE dd";
    case "1mo": return "dd MMM";
    default: return "HH:mm";
  }
}

export default function RealtimeChart({ uid, deviceId, vpin, widgetId, unit, timeRange, simulatedData }: RealtimeChartProps) {
  const [data, setData] = useState<HistoryEntry[]>([]);
  const chartRef = useRef<ChartJS<"line"> | null>(null);

  // Sync simulated data if provided
  useEffect(() => {
    if (simulatedData) {
      setData(simulatedData);
    }
  }, [simulatedData]);

  // Subscribe to history data from Firebase in realtime (for real devices)
  useEffect(() => {
    if (simulatedData) return;
    if (!uid || !deviceId || !vpin || uid === "public_ksm") return;

    const historyPath = `users/${uid}/devices/${deviceId}/history/${vpin}`;
    const historyQuery = query(
      ref(rtdb, historyPath),
      orderByChild("timestamp"),
      limitToLast(500)
    );

    const unsub = onValue(
      historyQuery,
      (snapshot) => {
        if (!snapshot.exists()) {
          setData([]);
          return;
        }
        const raw = snapshot.val();
        const entries: HistoryEntry[] = Object.values(raw)
          .map((e: any) => ({
            value: typeof e.value === "number" ? e.value : Number(e.value) || 0,
            timestamp: e.timestamp,
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setData(entries);
      },
      (error) => {
        console.warn("RealtimeChart subscription notice:", error.message);
        setData([]);
      }
    );

    return () => unsub();
  }, [uid, deviceId, vpin, simulatedData]);

  // Filter data by time range (for simulated data, show points directly)
  const now = Date.now();
  const rangeMs = getTimeRangeMs(timeRange);
  const cutoff = now - rangeMs;
  const filtered = simulatedData && simulatedData.length > 0 ? simulatedData : data.filter((d) => d.timestamp >= cutoff);

  // Current value
  const currentVal = filtered.length > 0 ? filtered[filtered.length - 1].value : null;

  if (!simulatedData && (!uid || !deviceId || !vpin)) {
    return (
      <div className="realtime-chart-empty">
        <span style={{ color: "#9ca3af", fontSize: 12 }}>
          Assign a device &amp; datastream to see chart
        </span>
      </div>
    );
  }

  // Chart.js data
  const chartData = {
    datasets: [
      {
        label: unit ? `Value (${unit})` : "Value",
        data: filtered.map((d) => ({
          x: d.timestamp,
          y: d.value,
        })),
        borderColor: "#0070f3",
        backgroundColor: "rgba(0, 112, 243, 0.1)",
        borderWidth: 2,
        pointRadius: filtered.length <= 30 ? 3 : filtered.length <= 80 ? 1.5 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#0070f3",
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        fill: true,
        tension: 0,           // Garis lurus tegas, tidak melengkung
        borderJoinStyle: "miter" as const,  // Sudut tajam
      },
    ],
  };

  // Chart.js options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 400,
    } as const,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: (items: any[]) => {
            if (items.length === 0) return "";
            const ts = items[0].parsed.x;
            return new Date(ts).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
          },
          label: (item: any) => {
            const val = item.parsed.y;
            return `${val.toFixed(2)} ${unit || ""}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "time" as const,
        time: {
          unit: getTimeUnit(timeRange),
          displayFormats: {
            second: getTimeDisplayFormats("Live"),
            minute: getTimeDisplayFormats("1h"),
            hour: getTimeDisplayFormats("1d"),
            day: getTimeDisplayFormats("1w"),
            month: getTimeDisplayFormats("1mo"),
          },
          tooltipFormat: "PPpp",
        },
        min: simulatedData && simulatedData.length > 0 ? Math.min(simulatedData[0].timestamp, cutoff) : cutoff,
        max: now,
        grid: {
          color: "rgba(0,0,0,0.05)",
          drawTicks: false,
        },
        ticks: {
          color: "#9ca3af",
          font: { size: 10 },
          maxRotation: 0,
          autoSkipPadding: 20,
        },
        border: {
          display: false,
        },
      },
      y: {
        grid: {
          color: "rgba(0,0,0,0.05)",
          drawTicks: false,
        },
        ticks: {
          color: "#9ca3af",
          font: { size: 10 },
          padding: 8,
        },
        border: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="realtime-chart-wrapper">
      <div className="realtime-chart-container">
        {filtered.length === 0 ? (
          <div className="realtime-chart-empty">
            <span style={{ color: "#9ca3af", fontSize: 12 }}>
              No data in this time range
            </span>
          </div>
        ) : (
          <Line
            ref={chartRef}
            data={chartData}
            options={chartOptions}
          />
        )}
      </div>

      {/* Footer: current value */}
      <div className="chart-val-footer">
        <span>
          Current: {currentVal !== null ? Number(currentVal).toFixed(2) : "--"} {unit || ""}
        </span>
      </div>
    </div>
  );
}
