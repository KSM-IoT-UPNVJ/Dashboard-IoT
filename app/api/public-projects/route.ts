import { NextRequest, NextResponse } from "next/server";
import { ref, get, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Helper to sanitize owner name: only show real name, if empty or email, use "KSMIoT"
function getCleanOwnerName(profile: any, displayName?: string | null, rawOwner?: string): string {
  const candidate = (profile?.fullName || profile?.name || displayName || "").trim();
  if (candidate && !candidate.includes("@")) {
    return candidate;
  }
  if (rawOwner) {
    const stripped = rawOwner.replace(/\s*\(you\)/gi, "").trim();
    if (stripped && !stripped.includes("@")) {
      return stripped;
    }
  }
  return "KSMIoT";
}

// Helper to normalize widgets into an array
function normalizeWidgets(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw).map(([id, val]: [string, any]) => ({ id, ...val }));
  }
  return [];
}

// GET /api/public-projects - Fetch all public dashboards & devices for the Landing Page
export async function GET() {
  try {
    const usersSnap = await get(ref(rtdb, "users"));
    const projects: any[] = [];
    const seenIds = new Set<string>();

    if (usersSnap.exists()) {
      const usersData = usersSnap.val();

      for (const [uid, userVal] of Object.entries<any>(usersData)) {
        const ownerName = getCleanOwnerName(userVal?.profile, userVal?.displayName);
        const userDevices = userVal?.devices || {};

        // 1. Scan user dashboards
        if (userVal?.dashboards) {
          for (const [dashId, dashVal] of Object.entries<any>(userVal.dashboards)) {
            const isPub =
              dashVal?.isPublic === true ||
              dashVal?.showOnLandingPage === true ||
              dashVal?.isPublic === "true" ||
              dashVal?.showOnLandingPage === "true";

            if (isPub) {
              const matchedDevices: Record<string, any> = {};
              let primaryBoard = "ESP32";
              let hasOnlineDevice = false;

              const widgets = normalizeWidgets(dashVal.widgets);

              for (const w of widgets) {
                if (w.deviceId && userDevices[w.deviceId]) {
                  const dev = userDevices[w.deviceId];
                  const last = Number(dev.lastSeen || dev.lastOnline || 0);
                  const isDevOnline = dev.status === "online" && last > 0 && Date.now() - last <= 30 * 60 * 1000;
                  matchedDevices[w.deviceId] = {
                    id: w.deviceId,
                    name: dev.name || "Device",
                    type: dev.type || "ESP32",
                    status: isDevOnline ? "online" : "offline",
                    lastOnline: last,
                    datastreams: dev.datastreams || {},
                  };
                  if (dev.type) primaryBoard = dev.type;
                  if (isDevOnline) hasOnlineDevice = true;
                }
              }

              // Fallback to first user device if widgets didn't specify one
              if (Object.keys(matchedDevices).length === 0 && Object.keys(userDevices).length > 0) {
                const firstDevEntry = Object.entries<any>(userDevices)[0];
                const firstDev = firstDevEntry[1];
                const firstLast = Number(firstDev.lastSeen || firstDev.lastOnline || 0);
                const isFirstOnline = firstDev.status === "online" && firstLast > 0 && Date.now() - firstLast <= 30 * 60 * 1000;
                matchedDevices[firstDevEntry[0]] = {
                  id: firstDevEntry[0],
                  name: firstDev.name || "Device",
                  type: firstDev.type || "ESP32",
                  status: isFirstOnline ? "online" : "offline",
                  lastOnline: firstLast,
                  datastreams: firstDev.datastreams || {},
                };
                primaryBoard = firstDev.type || "ESP32";
                if (isFirstOnline) hasOnlineDevice = true;
              }

              seenIds.add(dashId);
              projects.push({
                id: dashId,
                uid,
                name: dashVal.name || "IoT Project",
                owner: ownerName,
                board: primaryBoard,
                isOnline: hasOnlineDevice,
                widgets: widgets,
                devices: matchedDevices,
                updatedAt: dashVal.updatedAt || dashVal.createdAt || Date.now(),
              });
            }
          }
        }
      }
    }

    // Sort by updatedAt descending so newly published/selected dashboards appear first
    projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Always include the default KSMIoT sample project so users can switch between at least 2 projects
    projects.push({
      id: "sample_smart_greenhouse",
      uid: "public_ksm",
      name: "Smart Greenhouse & Environmental IoT",
      owner: "KSMIoT",
      board: "ESP32",
      isOnline: true,
      updatedAt: 1,
      widgets: [
        { id: "w1", type: "label", title: "Temperature Sensor", vpin: "V1", unit: "°C", colSpan: 1, value: 28.4 },
        { id: "w2", type: "switch", title: "Cooling Fan Switch", vpin: "V2", colSpan: 1, value: 0 },
        { id: "w3", type: "slider", title: "Irrigation Slider", vpin: "V3", unit: "%", min: 0, max: 100, colSpan: 1, value: 0 },
        { id: "w4", type: "chart", title: "Climate Data Chart", vpin: "V1", unit: "°C", colSpan: 2 },
        { id: "w5", type: "video", title: "Live Video Stream", colSpan: 1 },
        { id: "w6", type: "table", title: "Realtime Telemetry Table", colSpan: 3 }
      ],
      devices: {
        "dev_greenhouse": {
          id: "dev_greenhouse",
          name: "ESP32-Greenhouse",
          type: "ESP32",
          status: "online",
          datastreams: {
            "V1": { pin: "V1", name: "Suhu", displayName: "Suhu Udara", value: 28.4, unit: "°C" },
            "V2": { pin: "V2", name: "Kipas", displayName: "Status Kipas", value: 0, unit: "" },
            "V3": { pin: "V3", name: "Irigasi", displayName: "Level Irigasi", value: 0, unit: "%" },
          }
        }
      }
    });

    return NextResponse.json(
      { success: true, projects },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (err: any) {
    console.error("Error fetching public projects:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load public projects" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

// POST /api/public-projects - Toggle isPublic / showOnLandingPage state for a dashboard or device
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, dashboardId, deviceId, isPublic } = body;

    if (!uid || (!dashboardId && !deviceId)) {
      return NextResponse.json(
        { success: false, error: "Missing uid or dashboardId/deviceId" },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};
    if (dashboardId) {
      updates[`users/${uid}/dashboards/${dashboardId}/isPublic`] = Boolean(isPublic);
      updates[`users/${uid}/dashboards/${dashboardId}/showOnLandingPage`] = Boolean(isPublic);
      updates[`users/${uid}/dashboards/${dashboardId}/updatedAt`] = Date.now();
    }
    if (deviceId) {
      updates[`users/${uid}/devices/${deviceId}/isPublic`] = Boolean(isPublic);
      updates[`users/${uid}/devices/${deviceId}/showOnLandingPage`] = Boolean(isPublic);
      updates[`users/${uid}/devices/${deviceId}/updatedAt`] = Date.now();
    }

    await update(ref(rtdb), updates);

    return NextResponse.json(
      { success: true, isPublic: Boolean(isPublic) },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: any) {
    console.error("Error setting public project:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update project status" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
