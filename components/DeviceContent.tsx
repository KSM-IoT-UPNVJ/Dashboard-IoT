"use client";

import { useEffect, useState, DragEvent } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  ref, onValue, push, set, update, remove, get
} from "firebase/database";
import { auth, rtdb } from "@/lib/firebase";
import {
  WidgetType,
  Datastream,
  CanvasWidget,
  DeviceItem,
  getDefaultDatastreams,
  genAuthToken,
} from "@/lib/iot-types";
import WidgetSettingsModal from "./WidgetSettingsModal";
import NewDatastreamModal from "./NewDatastreamModal";
import RealtimeChart from "./RealtimeChart";

const LEGACY_TEMPLATE_NAMES = [
  "pembacaan pH",
  "pembacaan kelembapan",
  "status pompa",
  "suhu udara",
  "kecepatan kipas",
  "intensitas cahaya",
];

const PAGE_SIZE = 10;

export default function DeviceContent() {
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);

  // View mode: "list" | "detail" | "editWidgets"
  const [viewMode, setViewMode] = useState<"list" | "detail" | "editWidgets">("list");
  const [timeRange, setTimeRange] = useState<"Live" | "1h" | "1d" | "1w" | "1mo">("1d");

  // New Device Modal (Gambar 2)
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDevName, setNewDevName] = useState("");
  const [newDevBoard, setNewDevBoard] = useState<"Arduino" | "ESP32">("Arduino");
  const [newDevToken, setNewDevToken] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete Confirmation Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Device Detail: token visibility & copy feedback
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Canvas Widgets State (saat edit widget mode)
  const [canvasWidgets, setCanvasWidgets] = useState<CanvasWidget[]>([]);
  const [activeWidgetForModal, setActiveWidgetForModal] = useState<CanvasWidget | null>(null);
  const [showNewDsModal, setShowNewDsModal] = useState(false);

  // Drag and drop reorder state
  const [draggedWidgetIdx, setDraggedWidgetIdx] = useState<number | null>(null);

  // Search filter & Pagination (Gambar 3)
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting state for Device List table (Default: Newest created on top)
  const [sortField, setSortField] = useState<"name" | "token" | "owner" | "status" | "default">("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Device Name duplicate error message
  const [nameError, setNameError] = useState("");

  // User Profile for clean display name
  const [userProfile, setUserProfile] = useState<{ fullName?: string; name?: string } | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const profRef = ref(rtdb, `users/${user.uid}/profile`);
    return onValue(profRef, (snap) => {
      if (snap.exists()) {
        setUserProfile(snap.val());
      }
    });
  }, [user]);

  // Clean owner helper: show real name, if empty or email, use KSMIoT
  const getCleanOwnerName = (rawOwner?: string) => {
    const profName = (userProfile?.fullName || userProfile?.name || user?.displayName || "").trim();
    if (profName && !profName.includes("@")) return profName;
    if (rawOwner) {
      const stripped = rawOwner.replace(/\s*\(you\)/gi, "").trim();
      if (stripped && !stripped.includes("@")) return stripped;
    }
    return "KSMIoT";
  };

  // Heartbeat to automatically re-evaluate 30-minute online status
  const [, setHeartbeat] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setHeartbeat((h) => h + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch devices in realtime from Firebase RTDB
  useEffect(() => {
    if (!user) return;
    const devRef = ref(rtdb, `users/${user.uid}/devices`);
    return onValue(devRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setDevices([]);
        setLoading(false);
        return;
      }
      const list: DeviceItem[] = Object.entries(data).map(([id, val]) => {
        const item = val as Omit<DeviceItem, "id">;
        let wList: CanvasWidget[] = [];
        if (item.widgets) {
          if (Array.isArray(item.widgets)) {
            wList = item.widgets;
          } else {
            wList = Object.entries(item.widgets).map(([wid, w]) => ({
              ...(w as CanvasWidget),
              id: wid,
            }));
          }
        }

        // 30-minute timeout: device is only online if data was received in the last 30 minutes
        const last = Number(item.lastSeen || item.lastOnline || 0);
        const isOnline = item.status === "online" && last > 0 && Date.now() - last <= 30 * 60 * 1000;
        const effectiveStatus: "online" | "offline" = isOnline ? "online" : "offline";

        // Auto-heal RTDB status if inactive for > 30 minutes
        if (item.status === "online" && !isOnline && user) {
          update(ref(rtdb, `users/${user.uid}/devices/${id}`), { status: "offline" }).catch(() => {});
        }

        return {
          id,
          ...item,
          status: effectiveStatus,
          widgets: wList,
          datastreams: item.datastreams || {},
        };
      });
      setDevices(list);
      setLoading(false);

      // Keep selected device synced
      if (selectedDevice) {
        const found = list.find((d) => d.id === selectedDevice.id);
        if (found) setSelectedDevice(found);
      }
    });
  }, [user, selectedDevice?.id]);

  // Create a brand new device (Gambar 2)
  const handleCreateDevice = async () => {
    if (!user || !newDevName.trim()) return;

    // Device name cannot be identical to another device within the same account
    const trimmedName = newDevName.trim();
    const isDuplicate = devices.some(
      (d) => d.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      setNameError(`Nama device "${trimmedName}" sudah digunakan di akun Anda. Gunakan nama lain.`);
      return;
    }

    setCreating(true);
    setNameError("");
    try {
      const token = newDevToken.trim() || genAuthToken();
      const devRef = ref(rtdb, `users/${user.uid}/devices`);
      const newRef = push(devRef);
      const devId = newRef.key!;

      const newDeviceData: Omit<DeviceItem, "id"> = {
        name: newDevName.trim(),
        type: newDevBoard,
        authToken: token,
        owner: getCleanOwnerName(),
        status: "offline",
        lastSeen: null,
        createdAt: Date.now(),
        datastreams: {}, // Bersih tanpa template dummy!
        widgets: [],
      };

      await set(newRef, newDeviceData);

      // Best effort: Save token index for ESP32 authentication verification
      try {
        await set(ref(rtdb, `device_tokens/${token}`), {
          uid: user.uid,
          deviceId: devId,
          deviceName: newDevName.trim(),
          createdAt: Date.now(),
        });
      } catch (tokenErr) {
        console.warn("device_token sync notice:", tokenErr);
      }

      setShowAddModal(false);
      setNewDevName("");
      setNewDevToken("");
      setNewDevBoard("Arduino");

      // Langsung lanjutkan ke widget settings seperti di subtitle Gambar 2
      const createdItem: DeviceItem = { id: devId, ...newDeviceData };
      setSelectedDevice(createdItem);
      setCanvasWidgets([]);
      setViewMode("editWidgets");
    } catch (err: any) {
      console.error(err);
      alert("Gagal membuat device: " + (err?.message || "Periksa koneksi"));
    } finally {
      setCreating(false);
    }
  };

  // Prompt delete confirmation (modal)
  const handlePromptDelete = (id: string, name: string) => {
    setDeviceToDelete({ id, name });
    setShowDeleteModal(true);
  };

  // Pastikan delete device 100% berhasil!
  const handleConfirmDelete = async () => {
    if (!user || !deviceToDelete) return;
    setDeleting(true);
    const devId = deviceToDelete.id;
    const targetDev = devices.find((d) => d.id === devId);
    const token = targetDev?.authToken;

    try {
      let clientDeleted = false;

      // 1. Coba hapus via client SDK di path user (selalu authorized bagi user pemilik)
      try {
        await remove(ref(rtdb, `users/${user.uid}/devices/${devId}`));
        clientDeleted = true;
      } catch (clientErr) {
        console.warn("Client removal error, using server API delete:", clientErr);
      }

      // 2. Fallback via server API jika rules client bermasalah
      if (!clientDeleted) {
        const res = await fetch("/api/device/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: user.uid, deviceId: devId, authToken: token }),
        });
        if (!res.ok) {
          throw new Error("Gagal menghapus melalui server.");
        }
      }

      // 3. Bersihkan token index jika diizinkan (non-blocking)
      if (token) {
        try {
          await remove(ref(rtdb, `device_tokens/${token}`));
        } catch {
          // Ignore jika permission tidak mengizinkan write device_tokens langsung dari client
        }
      }

      // 4. Update state lokal
      setDevices((prev) => prev.filter((d) => d.id !== devId));
      if (selectedDevice?.id === devId) {
        setViewMode("list");
        setSelectedDevice(null);
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      alert("Gagal menghapus device: " + (err?.message || "Periksa koneksi database."));
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeviceToDelete(null);
    }
  };

  // Hapus datastream tertentu
  const handleDeleteDatastream = async (pinToDelete: string) => {
    if (!user || !selectedDevice) return;
    if (!confirm(`Hapus datastream pin "${pinToDelete}"?`)) return;
    try {
      await remove(ref(rtdb, `users/${user.uid}/devices/${selectedDevice.id}/datastreams/${pinToDelete}`));
      const updatedDs = { ...(selectedDevice.datastreams || {}) };
      delete updatedDs[pinToDelete];
      setSelectedDevice({ ...selectedDevice, datastreams: updatedDs });
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus datastream.");
    }
  };

  // Bersihkan semua template datastream bawaan (V0–V5)
  const handleClearLegacyTemplates = async () => {
    if (!user || !selectedDevice) return;
    const currentDs = selectedDevice.datastreams || {};
    const legacyEntries = Object.entries(currentDs).filter(([, ds]) =>
      LEGACY_TEMPLATE_NAMES.includes(ds.name)
    );
    if (legacyEntries.length === 0) return;
    if (!confirm(`Hapus ${legacyEntries.length} datastream template bawaan (V0–V5)?`)) return;

    try {
      for (const [pin] of legacyEntries) {
        await remove(ref(rtdb, `users/${user.uid}/devices/${selectedDevice.id}/datastreams/${pin}`));
      }
      const updatedDs = { ...currentDs };
      for (const [pin] of legacyEntries) {
        delete updatedDs[pin];
      }
      setSelectedDevice({ ...selectedDevice, datastreams: updatedDs });
    } catch (err) {
      console.error(err);
      alert("Gagal membersihkan template.");
    }
  };

  // Navigate to device detail view (Gambar 5)
  const handleOpenDeviceDetail = (device: DeviceItem) => {
    setSelectedDevice(device);
    setShowToken(false);
    setViewMode("detail");
  };

  // Navigate to widget editor (Widget Box + Canvas)
  const handleOpenEditWidgets = (device: DeviceItem) => {
    setSelectedDevice(device);
    setCanvasWidgets(device.widgets || []);
    setViewMode("editWidgets");
  };

  const handleApplyChanges = async () => {
    if (!user || !selectedDevice) return;
    try {
      await update(ref(rtdb, `users/${user.uid}/devices/${selectedDevice.id}`), {
        widgets: canvasWidgets,
      });
      setViewMode("detail");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan widget.");
    }
  };

  // "Edit Dashboard" button logic in Gambar 5
  const handleEditDashboard = async () => {
    if (!user || !selectedDevice) return;
    try {
      const dashSnap = await get(ref(rtdb, `users/${user.uid}/dashboards`));
      const dashData = dashSnap.val();
      if (dashData) {
        let matchedDashId = "";
        for (const [dashId, val] of Object.entries<any>(dashData)) {
          const dashDeviceIds: string[] = Array.isArray(val?.deviceIds) ? val.deviceIds : [];
          if (val?.deviceId === selectedDevice.id || dashDeviceIds.includes(selectedDevice.id)) {
            matchedDashId = dashId;
            break;
          }
          if (val?.widgets) {
            const wList = Array.isArray(val.widgets) ? val.widgets : Object.values(val.widgets);
            if (wList.some((w: any) => w?.deviceId === selectedDevice.id)) {
              matchedDashId = dashId;
              break;
            }
          }
        }
        if (matchedDashId) {
          window.location.href = `/dashboard?active=${matchedDashId}`;
          return;
        }
      }
      window.location.href = `/dashboard?createFor=${selectedDevice.id}`;
    } catch (err) {
      console.error(err);
      window.location.href = `/dashboard?createFor=${selectedDevice.id}`;
    }
  };

  // Add widget from Widget Box
  const addWidgetToCanvas = (type: WidgetType) => {
    const newId = `w_${Date.now()}`;
    let title = "New Widget";
    let colSpan = 1;

    switch (type) {
      case "switch": title = "Switch"; colSpan = 1; break;
      case "slider": title = "Slider"; colSpan = 1; break;
      case "label": title = "Label"; colSpan = 1; break;
      case "chart": title = "Data chart"; colSpan = 2; break;
      case "table": title = "Table"; colSpan = 2; break;
      case "image": title = "Device photo"; colSpan = 1; break;
      case "video": title = "Live video"; colSpan = 1; break;
    }

    const newWidget: CanvasWidget = {
      id: newId,
      type,
      title,
      deviceId: selectedDevice?.id,
      vpin: "",
      colSpan,
      value: 0,
    };

    setCanvasWidgets((prev) => [...prev, newWidget]);
    setActiveWidgetForModal(newWidget);
  };

  const removeWidgetFromCanvas = (id: string) => {
    setCanvasWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const handlePaletteDragStart = (e: DragEvent, type: WidgetType) => {
    e.dataTransfer.setData("widgetType", type);
  };

  const handleCanvasDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("widgetType") as WidgetType;
    if (type) addWidgetToCanvas(type);
  };

  const handleItemDragStart = (e: DragEvent, index: number) => {
    setDraggedWidgetIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleItemDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (draggedWidgetIdx === null || draggedWidgetIdx === index) return;
    const items = [...canvasWidgets];
    const draggedItem = items[draggedWidgetIdx];
    items.splice(draggedWidgetIdx, 1);
    items.splice(index, 0, draggedItem);
    setDraggedWidgetIdx(index);
    setCanvasWidgets(items);
  };

  const handleItemDragEnd = () => {
    setDraggedWidgetIdx(null);
  };

  const handleWidgetValueChange = async (vpin: string, val: number | string) => {
    if (!user || !selectedDevice || !vpin) return;
    try {
      const now = Date.now();
      await update(ref(rtdb, `users/${user.uid}/devices/${selectedDevice.id}/datastreams/${vpin}`), {
        value: val,
        updatedAt: now,
      });
      // Best-effort push history for chart
      const historyRef = ref(rtdb, `users/${user.uid}/devices/${selectedDevice.id}/history/${vpin}`);
      const newEntry = push(historyRef);
      await set(newEntry, { value: Number(val) || 0, timestamp: now });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveNewDatastream = async (newDs: Datastream) => {
    if (!user || !selectedDevice) return;
    try {
      await update(ref(rtdb, `users/${user.uid}/devices/${selectedDevice.id}/datastreams/${newDs.pin}`), newDs);
      const updatedDs = { ...(selectedDevice.datastreams || {}), [newDs.pin]: newDs };
      setSelectedDevice({ ...selectedDevice, datastreams: updatedDs });

      if (activeWidgetForModal) {
        setActiveWidgetForModal({
          ...activeWidgetForModal,
          vpin: newDs.pin,
          title: activeWidgetForModal.title || newDs.displayName || newDs.name,
        });
      }
      setShowNewDsModal(false);
    } catch (err) {
      console.error(err);
      alert("Gagal menambahkan datastream.");
    }
  };

  // Extract creation time for sorting (supports explicit createdAt or Firebase push ID timestamp)
  const getDeviceCreationTime = (d: DeviceItem): number => {
    if (d.createdAt && typeof d.createdAt === "number") return d.createdAt;
    if (d.id && d.id.startsWith("-") && d.id.length >= 8) {
      const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
      let time = 0;
      for (let i = 1; i < 9; i++) {
        const c = d.id.charAt(i);
        const idx = PUSH_CHARS.indexOf(c);
        if (idx === -1) break;
        time = time * 64 + idx;
      }
      if (time > 1600000000000 && time < 2500000000000) {
        return time;
      }
    }
    return 0;
  };

  const handleSort = (field: "name" | "token" | "owner" | "status") => {
    if (sortField === field) {
      // Toggle direction if already clicked
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  // Filter & Sorting
  const filteredDevices = devices.filter((d) =>
    (d.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.authToken || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sorting logic based on user rules
  const sortedDevices = [...filteredDevices].sort((a, b) => {
    const timeA = getDeviceCreationTime(a);
    const timeB = getDeviceCreationTime(b);

    // 1. Device Name: Urutkan sesuai abjad
    if (sortField === "name") {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    }

    // 2. Auth Token: Urutkan abjad awal auth token, jika sama abjad berikutnya
    if (sortField === "token") {
      const tokenA = (a.authToken || "").toLowerCase();
      const tokenB = (b.authToken || "").toLowerCase();
      const cmp = tokenA.localeCompare(tokenB);
      return sortDir === "asc" ? cmp : -cmp;
    }

    // 3. Device Owner: Urutkan waktu pembuatan, paling baru dibuat di paling atas
    if (sortField === "owner") {
      return sortDir === "asc" ? timeB - timeA : timeA - timeB;
    }

    // 4. Status: Utamakan online, jika ada yang sama-sama online/offline, paling akhir dibuat di paling atas
    if (sortField === "status") {
      const statusA = a.status === "online" ? 1 : 0;
      const statusB = b.status === "online" ? 1 : 0;

      if (sortDir === "asc") {
        if (statusA !== statusB) return statusB - statusA; // online (1) first
        return timeB - timeA; // newer first
      } else {
        if (statusA !== statusB) return statusA - statusB; // offline first
        return timeA - timeB; // older first
      }
    }

    // 5. Default: Paling atas yang paling baru dibuat
    return timeB - timeA;
  });

  const totalPages = Math.ceil(sortedDevices.length / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedDevices = sortedDevices.slice(startIndex, startIndex + PAGE_SIZE);

  if (loading) {
    return <div className="page-loading">Loading devices…</div>;
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 1: EDIT WIDGETS CANVAS (Widget Box & Drag-Drop)
  // ══════════════════════════════════════════════════════════
  if (viewMode === "editWidgets" && selectedDevice) {
    const ds = selectedDevice.datastreams || {};

    return (
      <div className="blynk-device-editor-page">
        {/* Header */}
        <div className="editor-top-header">
          <div>
            <h1 className="editor-main-title">Device</h1>
            <p className="editor-sub-title">Customize your widgets.</p>
          </div>
        </div>

        {/* Action Bar */}
        <div className="editor-action-bar">
          <div className="action-bar-left">
            <h2 className="widget-settings-heading">Widget Settings</h2>
            <span className="current-device-tag">({selectedDevice.name})</span>
          </div>
          <div className="action-bar-buttons">
            <button
              className="btn-editor-cancel"
              onClick={() => setViewMode("detail")}
            >
              Cancel
            </button>
            <button
              className="btn-editor-apply"
              onClick={handleApplyChanges}
            >
              Apply Changes
            </button>
          </div>
        </div>

        {/* Workspace: Sidebar + Canvas */}
        <div className="editor-workspace-layout">
          {/* Left Sidebar: Widget Box */}
          <div className="widget-box-sidebar">
            <div className="widget-box-header">
              <h3 className="widget-box-title">Widget Box</h3>
              <p className="widget-box-desc">Device metrics</p>
            </div>

            <div className="widget-box-categories">
              {/* Controls */}
              <div className="widget-category-group">
                <span className="category-group-label">Controls</span>
                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "switch")}
                  onClick={() => addWidgetToCanvas("switch")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Switch</span>
                  <div className="mock-switch-pill"><span className="mock-switch-circle" /></div>
                </div>

                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "slider")}
                  onClick={() => addWidgetToCanvas("slider")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Slider</span>
                  <div className="mock-slider-track">
                    <span className="mock-slider-thumb" />
                    <span className="mock-slider-val">1</span>
                  </div>
                </div>
              </div>

              {/* Tiles */}
              <div className="widget-category-group">
                <span className="category-group-label">Tiles</span>
                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "label")}
                  onClick={() => addWidgetToCanvas("label")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Label</span>
                  <span className="mock-tile-val">111</span>
                </div>
              </div>

              {/* Data */}
              <div className="widget-category-group">
                <span className="category-group-label">Data</span>
                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "table")}
                  onClick={() => addWidgetToCanvas("table")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Table</span>
                  <span className="mock-item-sub">Time • Sensor • Value</span>
                </div>

                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "image")}
                  onClick={() => addWidgetToCanvas("image")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Device photo</span>
                  <span className="mock-item-sub">Hardware diagram</span>
                </div>

                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "chart")}
                  onClick={() => addWidgetToCanvas("chart")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Data chart</span>
                  <span className="mock-item-sub">Realtime line chart</span>
                </div>
              </div>

              {/* Media */}
              <div className="widget-category-group">
                <span className="category-group-label">Media</span>
                <div
                  className="widget-draggable-card"
                  draggable
                  onDragStart={(e) => handlePaletteDragStart(e, "video")}
                  onClick={() => addWidgetToCanvas("video")}
                  title="Drag or click to add"
                >
                  <span className="card-item-title">Live video</span>
                  <span className="mock-item-sub">Camera stream</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Canvas */}
          <div
            className="widget-canvas-dropzone editing-mode"
            onDrop={handleCanvasDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {canvasWidgets.length === 0 ? (
              <div className="canvas-empty-state">
                <div className="canvas-empty-content">
                  <h3 className="empty-title">Add new widget</h3>
                  <p className="empty-sub">Drag a widget from the Widget Box to the canvas</p>
                </div>
              </div>
            ) : (
              <div className="canvas-widgets-grid">
                {canvasWidgets.map((w, index) => {
                  const currentDs = w.vpin ? ds[w.vpin] : null;
                  const currentVal = currentDs?.value !== undefined ? currentDs.value : w.value;
                  const isConfigured = Boolean(w.vpin && currentDs);

                  return (
                    <div
                      key={w.id}
                      draggable
                      onDragStart={(e) => handleItemDragStart(e, index)}
                      onDragOver={(e) => handleItemDragOver(e, index)}
                      onDragEnd={handleItemDragEnd}
                      className={`canvas-widget-card col-span-${w.colSpan || 1} ${draggedWidgetIdx === index ? "is-dragging" : ""}`}
                    >
                      <div className="card-header-bar">
                        <div>
                          <span className="card-widget-title">{w.title}</span>
                          {isConfigured ? (
                            <span className="card-dev-tag">[{w.vpin}]</span>
                          ) : (
                            <span className="card-dev-tag not-configured" style={{ color: "#ef4444" }}>
                              (Unassigned)
                            </span>
                          )}
                        </div>
                        <div className="card-actions-right">
                          <button
                            className="btn-card-gear"
                            title="Configure Datastream / Title"
                            onClick={() => setActiveWidgetForModal(w)}
                          >
                            <img src="/icons/sidebar-settings.svg" alt="Config" style={{ width: 14, height: 14 }} />
                          </button>
                          <button
                            className="btn-card-trash"
                            title="Delete"
                            onClick={() => removeWidgetFromCanvas(w.id)}
                          >
                            <img src="/icons/action-trash.svg" alt="Delete" style={{ width: 14, height: 14 }} />
                          </button>
                        </div>
                      </div>

                      <div className="card-widget-content">
                        {/* SWITCH */}
                        {w.type === "switch" && (
                          <div className="render-switch-row">
                            <button
                              className={`blynk-toggle-pill ${Number(currentVal) === 1 ? "active" : ""}`}
                              onClick={() => {
                                const next = Number(currentVal) === 1 ? 0 : 1;
                                handleWidgetValueChange(w.vpin!, next);
                              }}
                            >
                              <span className="toggle-pill-thumb" />
                            </button>
                            <span className="toggle-status-text">
                              {Number(currentVal) === 1 ? "On" : "Off"}
                            </span>
                          </div>
                        )}

                        {/* SLIDER */}
                        {w.type === "slider" && (
                          <div className="render-slider-row">
                            <input
                              type="range"
                              min={currentDs?.min ?? w.min ?? 0}
                              max={currentDs?.max ?? w.max ?? 100}
                              value={Number(currentVal) || 0}
                              className="blynk-slider-element"
                              onChange={(e) => handleWidgetValueChange(w.vpin!, Number(e.target.value))}
                            />
                            <span className="slider-value-display">{currentVal ?? 0}</span>
                          </div>
                        )}

                        {/* LABEL */}
                        {w.type === "label" && (
                          <div className="render-label-row">
                            <span className="label-large-text">
                              {currentVal ?? "--"} {currentDs?.unit || w.unit || ""}
                            </span>
                          </div>
                        )}

                        {/* CHART */}
                        {w.type === "chart" && (
                          <div className="render-chart-block">
                            <div className="widget-chart-clean-view">
                              <RealtimeChart
                                uid={user?.uid || ""}
                                deviceId={selectedDevice?.id || ""}
                                vpin={w.vpin || ""}
                                widgetId={w.id}
                                unit={currentDs?.unit || w.unit || ""}
                                timeRange={timeRange}
                              />
                            </div>
                          </div>
                        )}

                        {/* IMAGE */}
                        {w.type === "image" && (
                          <div className="render-image-block">
                            {typeof currentVal === "string" && (currentVal.startsWith("http") || currentVal.startsWith("data:image")) ? (
                              <img
                                src={currentVal}
                                alt={w.title}
                                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}
                              />
                            ) : (
                              <div className="image-mock-esp32">
                                <span className="dot-pin p-tl" />
                                <span className="dot-pin p-tr" />
                                <span className="dot-pin p-bl" />
                                <span className="dot-pin p-br" />
                                <div className="esp-chip-core">{selectedDevice.type || "ESP32"}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* TABLE */}
                        {w.type === "table" && (
                          <div className="render-table-block">
                            {Object.keys(ds).length === 0 ? (
                              <div style={{ color: "#9ca3af", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
                                Belum ada datastream.
                              </div>
                            ) : (
                              <table className="blynk-data-table">
                                <thead>
                                  <tr>
                                    <th>Pin</th>
                                    <th>Sensor</th>
                                    <th>Value</th>
                                    <th>Waktu</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(ds).map(([pin, stream]) => {
                                    const timeStr = (stream as any).updatedAt
                                      ? new Date((stream as any).updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                                      : selectedDevice.lastSeen
                                      ? new Date(selectedDevice.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                                      : "--:--:--";
                                    return (
                                      <tr key={pin}>
                                        <td>{pin}</td>
                                        <td>{stream.displayName || stream.name}</td>
                                        <td>
                                          {stream.value !== undefined ? String(stream.value) : "—"} {stream.unit || ""}
                                        </td>
                                        <td style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                                          {timeStr}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}

                        {/* VIDEO */}
                        {w.type === "video" && (
                          <div className="render-video-block">
                            {typeof currentVal === "string" && (currentVal.startsWith("http") || currentVal.includes("youtube.com") || currentVal.includes("youtu.be")) ? (
                              <div className="video-camera-screen" style={{ position: "relative", overflow: "hidden" }}>
                                {currentVal.includes("youtube.com") || currentVal.includes("youtu.be") ? (
                                  <iframe
                                    src={currentVal.includes("embed") ? currentVal : currentVal.replace("watch?v=", "embed/")}
                                    title={w.title}
                                    style={{ width: "100%", height: "100%", border: "none" }}
                                    allow="autoplay; encrypted-media"
                                    allowFullScreen
                                  />
                                ) : (
                                  <img
                                    src={currentVal}
                                    alt="Live stream"
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                )}
                                <div className="camera-live-badge">LIVE</div>
                                <div className="camera-footer-info">CAM-01</div>
                              </div>
                            ) : (
                              <div className="video-camera-screen">
                                <div className="camera-live-badge">LIVE</div>
                                <div className="camera-footer-info">CAM-01</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MODAL: WIDGET SETTINGS */}
        {activeWidgetForModal && (
          <WidgetSettingsModal
            widget={activeWidgetForModal}
            device={selectedDevice}
            onClose={() => setActiveWidgetForModal(null)}
            onSave={(updated) => {
              setCanvasWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
              setActiveWidgetForModal(null);
            }}
            onCreateDatastream={() => setShowNewDsModal(true)}
          />
        )}

        {/* MODAL: NEW DATASTREAM */}
        {showNewDsModal && (
          <NewDatastreamModal
            existingPins={Object.keys(ds)}
            onClose={() => setShowNewDsModal(false)}
            onSave={handleSaveNewDatastream}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 2: DEVICE DETAIL (Gambar 5 - Read View)
  // ══════════════════════════════════════════════════════════
  if (viewMode === "detail" && selectedDevice) {
    const ds = selectedDevice.datastreams || {};
    const widgets = selectedDevice.widgets || [];
    const hasLegacy = Object.values(ds).some((item) => LEGACY_TEMPLATE_NAMES.includes(item.name));

    return (
      <div className="dev-detail-page-container">
        {/* Top Breadcrumb with Back Arrow (Gambar 5) */}
        <div className="dev-detail-breadcrumb-bar">
          <button
            className="btn-detail-back-arrow"
            onClick={() => {
              setViewMode("list");
              setSelectedDevice(null);
            }}
            title="Kembali ke Device List"
          >
            <img src="/icons/back.svg" alt="Back" style={{ width: 18, height: 18 }} />
          </button>
          <div className="dev-breadcrumb-path">
            <span
              className="crumb-link"
              onClick={() => {
                setViewMode("list");
                setSelectedDevice(null);
              }}
            >
              Device
            </span>
            <span className="crumb-slash"> / </span>
            <span className="crumb-active">{selectedDevice.name}</span>
          </div>
        </div>

        {/* Device Information Card (Gambar 5) */}
        <div className="dev-detail-card-box">
          <div className="dev-card-left-group">
            {/* Chip Avatar Icon */}
            <div className="dev-chip-icon-box">
              <img src="/icons/sidebar-device.svg" alt="Device" style={{ width: 22, height: 22 }} />
            </div>

            {/* Info Texts */}
            <div className="dev-info-texts">
              <div className="dev-title-status-row">
                <h1 className="dev-name-heading">{selectedDevice.name}</h1>
                <span className={`dev-status-badge ${selectedDevice.status}`}>
                  • {selectedDevice.status === "online" ? "Online" : "Offline"}
                </span>
              </div>

              <div className="dev-meta-line">
                <span className="meta-text">
                  Owner <strong>{getCleanOwnerName(selectedDevice.owner)}</strong>
                </span>
                <span className="meta-sep" />
                <span className="meta-text">
                  Board <strong>{selectedDevice.type || "ESP32"}</strong>
                </span>
                <span className="meta-sep" />
                <span className="meta-text">
                  Data Masuk: <strong>{selectedDevice.lastSeen ? new Date(selectedDevice.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Belum ada"}</strong>
                </span>
              </div>

              {/* AuthToken row with eye toggle & copy */}
              <div className="dev-auth-token-row">
                <span className="auth-token-label">AuthToken:</span>
                <span className="auth-token-val">
                  {showToken
                    ? selectedDevice.authToken
                    : `${selectedDevice.authToken ? selectedDevice.authToken.slice(0, 8) : "GoE5-mYy"} •••••`}
                </span>

                <button
                  className="btn-auth-eye"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? "Sembunyikan AuthToken" : "Lihat AuthToken"}
                >
                  {showToken ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="eye-svg">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="eye-svg">
                      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>

                <button
                  className="btn-auth-copy"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedDevice.authToken || "");
                    setCopiedToken(true);
                    setTimeout(() => setCopiedToken(false), 2000);
                  }}
                  title="Salin AuthToken untuk Arduino IDE"
                >
                  {copiedToken ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons: Widget Settings & Edit Dashboard (Gambar 5) */}
          <div className="dev-card-right-actions">
            <button
              className="btn-widget-settings-pill"
              onClick={() => handleOpenEditWidgets(selectedDevice)}
            >
              Widget Settings
            </button>
            <button
              className="btn-edit-dashboard-pill"
              onClick={handleEditDashboard}
            >
              Edit Dashboard
            </button>
          </div>
        </div>

        {/* Datastreams Quick-Manage Section */}
        {hasLegacy && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#9a3412" }}>
              Perangkat ini memiliki datastream template bawaan lama (V0-V5). Ingin menghapusnya agar bersih?
            </span>
            <button
              type="button"
              onClick={handleClearLegacyTemplates}
              style={{
                background: "#ea580c",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✕ Hapus Template V0-V5
            </button>
          </div>
        )}

        {/* Widgets Grid View (Gambar 5) */}
        <div className="dev-detail-widgets-area">
          {widgets.length === 0 ? (
            <div className="canvas-empty-state" style={{ minHeight: 200 }}>
              <div className="canvas-empty-content">
                <h3 className="empty-title">Belum ada widget pada device ini</h3>
                <p className="empty-sub">
                  Klik tombol <strong>Widget Settings</strong> di atas untuk menambahkan kontrol, gauge, chart, dan indikator.
                </p>
                <button
                  className="btn-dash-new-primary"
                  onClick={() => handleOpenEditWidgets(selectedDevice)}
                  style={{ marginTop: 14 }}
                >
                  + Tambah Widget Sekarang
                </button>
              </div>
            </div>
          ) : (
            <div>
              {widgets.some((w) => w.type === "chart") && (
                <div className="dash-timerange-bar" style={{ marginBottom: 16 }}>
                  {(["Live", "1h", "1d", "1w", "1mo"] as const).map((r) => (
                    <button
                      key={r}
                      className={`dash-time-pill ${timeRange === r ? "active" : ""}`}
                      onClick={() => setTimeRange(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
              <div className="canvas-widgets-grid">
              {widgets.map((w) => {
                const currentDs = w.vpin ? ds[w.vpin] : null;
                const currentVal = currentDs?.value !== undefined ? currentDs.value : w.value;

                return (
                  <div key={w.id} className={`canvas-widget-card col-span-${w.colSpan || 1}`}>
                    <div className="card-header-bar">
                      <div>
                        <span className="card-widget-title">{w.title}</span>
                        {w.vpin && currentDs && (
                          <span className="card-dev-tag">[{w.vpin}]</span>
                        )}
                      </div>
                    </div>

                    <div className="card-widget-content">
                      {/* SWITCH */}
                      {w.type === "switch" && (
                        <div className="render-switch-row">
                          <button
                            className={`blynk-toggle-pill ${Number(currentVal) === 1 ? "active" : ""}`}
                            onClick={() => {
                              const next = Number(currentVal) === 1 ? 0 : 1;
                              handleWidgetValueChange(w.vpin!, next);
                            }}
                          >
                            <span className="toggle-pill-thumb" />
                          </button>
                          <span className="toggle-status-text">
                            {Number(currentVal) === 1 ? "On" : "Off"}
                          </span>
                        </div>
                      )}

                      {/* SLIDER */}
                      {w.type === "slider" && (
                        <div className="render-slider-row">
                          <input
                            type="range"
                            min={currentDs?.min ?? w.min ?? 0}
                            max={currentDs?.max ?? w.max ?? 100}
                            value={Number(currentVal) || 0}
                            className="blynk-slider-element"
                            onChange={(e) => handleWidgetValueChange(w.vpin!, Number(e.target.value))}
                          />
                          <span className="slider-value-display">{currentVal ?? 0}</span>
                        </div>
                      )}

                      {/* LABEL */}
                      {w.type === "label" && (
                        <div className="render-label-row">
                          <span className="label-large-text">
                            {currentVal ?? "--"} {currentDs?.unit || w.unit || ""}
                          </span>
                        </div>
                      )}

                      {/* CHART */}
                      {w.type === "chart" && (
                        <div className="render-chart-block">
                          <div className="widget-chart-clean-view">
                            <RealtimeChart
                              uid={user?.uid || ""}
                              deviceId={selectedDevice?.id || ""}
                              vpin={w.vpin || ""}
                              widgetId={w.id}
                              unit={currentDs?.unit || w.unit || ""}
                              timeRange={timeRange}
                            />
                          </div>
                        </div>
                      )}

                      {/* IMAGE */}
                      {w.type === "image" && (
                        <div className="render-image-block">
                          {typeof currentVal === "string" && (currentVal.startsWith("http") || currentVal.startsWith("data:image")) ? (
                            <img
                              src={currentVal}
                              alt={w.title}
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}
                            />
                          ) : (
                            <div className="image-mock-esp32">
                              <span className="dot-pin p-tl" />
                              <span className="dot-pin p-tr" />
                              <span className="dot-pin p-bl" />
                              <span className="dot-pin p-br" />
                              <div className="esp-chip-core">{selectedDevice.type || "ESP32"}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TABLE */}
                      {w.type === "table" && (
                        <div className="render-table-block">
                          {Object.keys(ds).length === 0 ? (
                            <div style={{ color: "#9ca3af", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
                              Belum ada datastream pada device ini.
                            </div>
                          ) : (
                            <table className="blynk-data-table">
                              <thead>
                                <tr>
                                  <th>Pin</th>
                                  <th>Sensor</th>
                                  <th>Value</th>
                                  <th style={{ width: 40 }}>Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(ds).map(([pin, stream]) => (
                                  <tr key={pin}>
                                    <td>{pin}</td>
                                    <td>{stream.displayName || stream.name}</td>
                                    <td>
                                      {stream.value !== undefined ? String(stream.value) : "—"} {stream.unit || ""}
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDatastream(pin)}
                                        title="Hapus pin ini"
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          cursor: "pointer",
                                          padding: 2,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center"
                                        }}
                                      >
                                        <img src="/icons/action-trash.svg" alt="Hapus" style={{ width: 14, height: 14 }} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* VIDEO */}
                      {w.type === "video" && (
                        <div className="render-video-block">
                          {typeof currentVal === "string" && (currentVal.startsWith("http") || currentVal.includes("youtube.com") || currentVal.includes("youtu.be")) ? (
                            <div className="video-camera-screen" style={{ position: "relative", overflow: "hidden" }}>
                              {currentVal.includes("youtube.com") || currentVal.includes("youtu.be") ? (
                                <iframe
                                  src={currentVal.includes("embed") ? currentVal : currentVal.replace("watch?v=", "embed/")}
                                  title={w.title}
                                  style={{ width: "100%", height: "100%", border: "none" }}
                                  allow="autoplay; encrypted-media"
                                  allowFullScreen
                                />
                              ) : (
                                <img
                                  src={currentVal}
                                  alt="Live stream"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              )}
                              <div className="camera-live-badge">LIVE</div>
                              <div className="camera-footer-info">CAM-01</div>
                            </div>
                          ) : (
                            <div className="video-camera-screen">
                              <div className="camera-live-badge">LIVE</div>
                              <div className="camera-footer-info">CAM-01</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 3: DEVICE LIST (Gambar 3 & 4)
  // ══════════════════════════════════════════════════════════
  return (
    <div className="blynk-device-list-page">
      {/* Header */}
      <div className="page-header-simple">
        <h1 className="page-title-bold">Device</h1>
        <p className="page-sub-text">Your devices, your control</p>
      </div>

      {/* Table Section Header */}
      <div className="device-table-toolbar">
        <h2 className="device-list-heading">Device List</h2>
        <button
          className="btn-new-device-blue"
          onClick={() => {
            setNewDevName("");
            setNameError("");
            setNewDevBoard("Arduino");
            setNewDevToken(genAuthToken());
            setShowAddModal(true);
          }}
        >
          <span className="plus-icon">⊕</span> New Device
        </button>
      </div>

      {/* Devices Table (Gambar 4) */}
      <div className="device-table-card">
        <table className="device-modern-table">
          <thead>
            <tr>
              <th
                className="col-name"
                onClick={() => handleSort("name")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Urutkan berdasarkan abjad nama device"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Device Name
                  <img
                    src="/icons/sort-arrow.svg"
                    alt=""
                    style={{
                      width: 12,
                      height: 12,
                      transform: sortField === "name" && sortDir === "desc" ? "rotate(180deg)" : "none",
                      opacity: sortField === "name" ? 1 : 0.45,
                      transition: "transform 0.2s, opacity 0.2s",
                    }}
                  />
                </span>
              </th>
              <th
                className="col-token"
                onClick={() => handleSort("token")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Urutkan berdasarkan abjad Auth Token"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Auth Token
                  <img
                    src="/icons/sort-arrow.svg"
                    alt=""
                    style={{
                      width: 12,
                      height: 12,
                      transform: sortField === "token" && sortDir === "desc" ? "rotate(180deg)" : "none",
                      opacity: sortField === "token" ? 1 : 0.45,
                      transition: "transform 0.2s, opacity 0.2s",
                    }}
                  />
                </span>
              </th>
              <th
                className="col-owner"
                onClick={() => handleSort("owner")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Urutkan berdasarkan waktu pembuatan device (paling baru di atas)"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Device Owner
                  <img
                    src="/icons/sort-arrow.svg"
                    alt=""
                    style={{
                      width: 12,
                      height: 12,
                      transform: sortField === "owner" && sortDir === "desc" ? "rotate(180deg)" : "none",
                      opacity: sortField === "owner" ? 1 : 0.45,
                      transition: "transform 0.2s, opacity 0.2s",
                    }}
                  />
                </span>
              </th>
              <th
                className="col-status"
                onClick={() => handleSort("status")}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Urutkan status: Online diutamakan, lalu terbaru"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Status
                  <img
                    src="/icons/sort-arrow.svg"
                    alt=""
                    style={{
                      width: 12,
                      height: 12,
                      transform: sortField === "status" && sortDir === "desc" ? "rotate(180deg)" : "none",
                      opacity: sortField === "status" ? 1 : 0.45,
                      transition: "transform 0.2s, opacity 0.2s",
                    }}
                  />
                </span>
              </th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedDevices.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-devices-row">
                  Belum ada device. Klik <strong>+ New Device</strong> untuk menambahkan perangkat baru.
                </td>
              </tr>
            ) : (
              paginatedDevices.map((d) => (
                <tr
                  key={d.id}
                  className="device-row-clickable"
                  onClick={() => handleOpenDeviceDetail(d)}
                  title="Klik untuk membuka detail device"
                >
                  <td className="cell-name">
                    <span className="dev-name-text">{d.name}</span>
                  </td>
                  <td className="cell-token">
                    <span className="token-masked">
                      {d.authToken ? `${d.authToken.slice(0, 8)} - •••••` : "—"}
                    </span>
                  </td>
                  <td className="cell-owner">{getCleanOwnerName(d.owner)}</td>
                  <td className="cell-status">
                    <span className={`status-pill ${d.status}`}>
                      {d.status === "online" ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn-action-icon"
                      title="Edit Widgets"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditWidgets(d);
                      }}
                    >
                      <img src="/icons/action-open.svg" alt="Edit" style={{ width: 16, height: 16 }} />
                    </button>
                    <button
                      className="btn-action-icon danger"
                      title="Delete Device"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromptDelete(d.id, d.name);
                      }}
                    >
                      <img src="/icons/action-trash.svg" alt="Delete" style={{ width: 16, height: 16 }} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── PAGINATION BAR (Gambar 3) ── */}
        <div className="device-table-pagination-bar">
          <div className="pagination-info-text">
            Showing <strong>{filteredDevices.length > 0 ? startIndex + 1 : 0}</strong> to{" "}
            <strong>{Math.min(startIndex + PAGE_SIZE, filteredDevices.length)}</strong> of{" "}
            <strong>{filteredDevices.length}</strong> registered devices
          </div>

          <div className="pagination-buttons-group">
            <button
              type="button"
              className="btn-page-nav-pill"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <img src="/icons/caret-left.svg" alt="" style={{ width: 12, height: 12 }} />
              Previous
            </button>
            <button
              type="button"
              className="btn-page-nav-pill"
              disabled={currentPage >= totalPages || filteredDevices.length === 0}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              Next
              <img src="/icons/caret-right.svg" alt="" style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL: CREATE NEW DEVICE (Gambar 2) ── */}
      {showAddModal && (
        <div className="modal-backdrop-blur" onClick={() => setShowAddModal(false)}>
          <div className="modal-content-card blynk-new-dev-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header-clean">
              <h3 className="modal-title-bold">New device</h3>
              <p className="modal-subtitle-text">Fill in the device details, then continue to widget settings.</p>
            </div>

            <div className="modal-body-form" style={{ marginTop: 18 }}>
              {/* Device Name with Duplicate Prevention */}
              <div className="modal-input-group">
                <label className="modal-label-bold">Device Name</label>
                <input
                  type="text"
                  placeholder="e.g. Smart Greenhouse"
                  value={newDevName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewDevName(val);
                    const trimmed = val.trim().toLowerCase();
                    if (trimmed && devices.some((d) => d.name.trim().toLowerCase() === trimmed)) {
                      setNameError(`Nama device "${val.trim()}" sudah ada di akun ini. Gunakan nama lain.`);
                    } else {
                      setNameError("");
                    }
                  }}
                  className="modal-text-input"
                  style={{
                    borderColor: nameError ? "#ef4444" : undefined,
                    boxShadow: nameError ? "0 0 0 2px rgba(239,68,68,0.2)" : undefined,
                  }}
                  autoFocus
                />
                {nameError && (
                  <span style={{ color: "#ef4444", fontSize: 12, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    ⚠️ {nameError}
                  </span>
                )}
              </div>

              {/* Board: Arduino & ESP32 Only (Gambar 2) */}
              <div className="modal-input-group" style={{ marginTop: 16 }}>
                <label className="modal-label-bold">Board</label>
                <div style={{ display: "flex", gap: 32, marginTop: 6 }}>
                  <label
                    className="device-radio-item"
                    style={{ cursor: "pointer" }}
                    onClick={() => setNewDevBoard("Arduino")}
                  >
                    <span className={`custom-radio-circle ${newDevBoard === "Arduino" ? "checked" : ""}`}>
                      {newDevBoard === "Arduino" && <span className="custom-radio-inner" />}
                    </span>
                    <span className="device-radio-label">Arduino</span>
                  </label>

                  <label
                    className="device-radio-item"
                    style={{ cursor: "pointer" }}
                    onClick={() => setNewDevBoard("ESP32")}
                  >
                    <span className={`custom-radio-circle ${newDevBoard === "ESP32" ? "checked" : ""}`}>
                      {newDevBoard === "ESP32" && <span className="custom-radio-inner" />}
                    </span>
                    <span className="device-radio-label">ESP32</span>
                  </label>
                </div>
              </div>

              {/* Token/Key with Generate button (Gambar 2) */}
              <div className="modal-input-group" style={{ marginTop: 18 }}>
                <label className="modal-label-bold">Token/Key</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Paste the token from your device"
                    value={newDevToken}
                    onChange={(e) => setNewDevToken(e.target.value)}
                    className="modal-text-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn-token-generate"
                    onClick={() => setNewDevToken(genAuthToken())}
                    title="Generate token acak baru"
                  >
                    Generate
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Buttons: Cancel & Confirm (Gambar 2) */}
            <div className="modal-footer-between" style={{ marginTop: 24 }}>
              <div />
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="button"
                  className="btn-modal-pill-cancel"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-pill-next"
                  disabled={!newDevName.trim() || Boolean(nameError) || creating}
                  onClick={handleCreateDevice}
                >
                  {creating ? "Creating..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DELETE CONFIRMATION ── */}
      {showDeleteModal && deviceToDelete && (
        <div
          className="modal-backdrop-blur"
          onClick={() => {
            if (!deleting) {
              setShowDeleteModal(false);
              setDeviceToDelete(null);
            }
          }}
        >
          <div className="modal-content-card modal-delete-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3>Delete Device</h3>
              <button
                className="btn-close-modal"
                disabled={deleting}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeviceToDelete(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body-form">
              <div className="delete-confirm-body">
                <div className="delete-device-name">&quot;{deviceToDelete.name}&quot;</div>
                <p className="delete-confirm-text">
                  Apakah Anda yakin ingin menghapus perangkat ini? Semua widget dan konfigurasi terkait perangkat ini akan dihapus permanen.
                </p>
              </div>
            </div>
            <div className="modal-footer-simple">
              <button
                className="btn-modal-cancel"
                disabled={deleting}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeviceToDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-modal-delete"
                disabled={deleting}
                onClick={handleConfirmDelete}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
