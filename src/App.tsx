import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  FolderKanban,
  BarChart3,
  Bug,
  Play,
  Trash2,
  Edit,
  Clock,
  Database,
  X,
  ChevronLeft,
  Plus,
  RefreshCw,
  Sliders,
  Camera,
  Video,
  CheckCircle,
  FileText,
  AlertTriangle,
  AlertCircle,
  LayoutGrid,
  List,
  CloudUpload,
  CloudDownload,
  FolderOpen
} from "lucide-react";

interface AppProps {
  isConvexConfigured: boolean;
}

export default function App({ isConvexConfigured }: AppProps) {
  const [activeTab, setActiveTab] = useState<"projects" | "analytics" | "bugs">("projects");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Form states for project
  const [projName, setProjName] = useState("");
  const [projFolder, setProjFolder] = useState("");
  const [projFtpHost, setProjFtpHost] = useState("");
  const [projFtpUser, setProjFtpUser] = useState("");
  const [projFtpPass, setProjFtpPass] = useState("");
  const [projFtpDomain, setProjFtpDomain] = useState("");
  const [projBaseDir, setProjBaseDir] = useState("public_html");
  const [projInjectMode, setProjInjectMode] = useState("none");
  const [projUploadMode, setProjUploadMode] = useState("full");
  const [projUploadHtaccess, setProjUploadHtaccess] = useState(true);

  // Convex Queries and Mutations
  const projects = useQuery(api.projects.get);
  const allSessions = useQuery(api.sessions.get);
  const allBugs = useQuery(api.bug_reports.get);

  const addProject = useMutation(api.projects.add);
  const updateProject = useMutation(api.projects.update);
  const deleteProject = useMutation(api.projects.remove);
  const generateUploadUrl = useMutation(api.bug_reports.generateUploadUrl);
  const updateProjectZip = useMutation(api.projects.updateZip);

  const [localPaths, setLocalPaths] = useState<Record<string, { path: string; isValid: boolean }>>({});
  const [uploadingProjId, setUploadingProjId] = useState<string | null>(null);
  const [downloadingProjId, setDownloadingProjId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const refreshLocalPaths = async () => {
    try {
      const pathsMap = await (window as any).electron.ipcRenderer.invoke("get-all-local-paths");
      const updated: Record<string, { path: string; isValid: boolean }> = {};
      if (projects) {
        for (const p of projects) {
          let path = pathsMap[p.name]?.build_folder || "";
          if (!path && p.buildFolder) {
            path = p.buildFolder;
          }
          let isValid = false;
          if (path) {
            isValid = await (window as any).electron.ipcRenderer.invoke("validate-path", path);
          }
          updated[p.name] = { path, isValid };
        }
      }
      setLocalPaths(updated);
    } catch (e) {
      console.error("Failed to refresh local paths:", e);
    }
  };

  useEffect(() => {
    if (projects) {
      refreshLocalPaths();
    }
  }, [projects]);

  const handleUploadZip = async (project: any) => {
    const local = localPaths[project.name];
    if (!local || !local.isValid) {
      showToast("Cannot upload: no valid local build folder found.", "error");
      return;
    }

    setUploadingProjId(project._id);
    try {
      showToast("Zipping build folder...", "info");
      const zipBuffer = await (window as any).electron.ipcRenderer.invoke("zip-folder", local.path);
      if (zipBuffer.error) {
        throw new Error(zipBuffer.error);
      }

      showToast("Requesting cloud upload credentials...", "info");
      const uploadUrl = await generateUploadUrl();

      showToast("Uploading build to Cloud Storage...", "info");
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: zipBuffer,
      });

      if (!response.ok) {
        throw new Error("Failed to upload ZIP archive to storage.");
      }

      const { storageId } = await response.json();

      showToast("Finalizing cloud project registration...", "info");
      await updateProjectZip({
        id: project._id,
        buildZipId: storageId,
      });

      showToast("Cloud build uploaded successfully!");
    } catch (e: any) {
      showToast(e.message || "Failed to upload cloud build.", "error");
    } finally {
      setUploadingProjId(null);
    }
  };

  const handleDownloadZip = async (project: any) => {
    if (!project.buildZipUrl) {
      showToast("No cloud build ZIP URL available.", "error");
      return;
    }

    setDownloadingProjId(project._id);
    try {
      showToast("Downloading cloud build ZIP...", "info");
      const response = await fetch(project.buildZipUrl);
      if (!response.ok) {
        throw new Error("Failed to download ZIP from cloud storage.");
      }

      const arrayBuffer = await response.arrayBuffer();

      showToast("Extracting build files...", "info");
      const result = await (window as any).electron.ipcRenderer.invoke("unzip-build", project.name, arrayBuffer);
      if (result.error) {
        throw new Error(result.error);
      }

      showToast("Build downloaded and installed successfully!");
      await refreshLocalPaths();
    } catch (e: any) {
      showToast(e.message || "Failed to download build.", "error");
    } finally {
      setDownloadingProjId(null);
    }
  };

  const handleSelectLocalFolderForProject = async (p: any) => {
    try {
      const folderPath = await (window as any).electron.ipcRenderer.invoke("select-folder");
      if (folderPath) {
        const isValid = await (window as any).electron.ipcRenderer.invoke("validate-path", folderPath);
        if (!isValid) {
          showToast("Invalid WebGL build directory structure.", "error");
          return;
        }
        await (window as any).electron.ipcRenderer.invoke("save-local-path", p.name, folderPath);
        showToast(`Local build path mapped for ${p.name}`);
        await refreshLocalPaths();
      }
    } catch (e: any) {
      showToast("Failed to set local build folder.", "error");
    }
  };

  const renderProjectActions = (p: any, size: "sm" | "md" = "md") => {
    const local = localPaths[p.name];
    const isLocalValid = local?.isValid;
    const isUploading = uploadingProjId === p._id;
    const isDownloading = downloadingProjId === p._id;

    if (size === "sm") {
      const btnClass = "flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-semibold px-2 py-1 rounded border border-zinc-800 transition-colors shadow-sm cursor-pointer";
      const cloudBtnClass = "flex items-center gap-1 bg-blue-950/45 hover:bg-blue-900/45 text-blue-200 text-[10px] font-semibold px-2 py-1 rounded border border-blue-900/50 transition-colors shadow-sm cursor-pointer";

      if (isDownloading) {
        return (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
            <span>Downloading...</span>
          </div>
        );
      }
      if (isUploading) {
        return (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
            <span>Uploading...</span>
          </div>
        );
      }

      if (isLocalValid) {
        return (
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => setSelectedProject(p)}
              className={btnClass}
            >
              <Play className="w-2.5 h-2.5 fill-current text-emerald-450" />
              <span>Launch</span>
            </button>
            <button
              onClick={() => handleUploadZip(p)}
              className={cloudBtnClass}
              title="Upload build to cloud"
            >
              <CloudUpload className="w-2.5 h-2.5 text-blue-400" />
              <span>Upload ZIP</span>
            </button>
          </div>
        );
      }

      if (p.buildZipUrl) {
        return (
          <button
            onClick={() => handleDownloadZip(p)}
            className="flex items-center gap-1 bg-blue-950/60 hover:bg-blue-900/70 text-blue-200 text-[10px] font-semibold px-2 py-1 rounded border border-blue-900/80 cursor-pointer"
          >
            <CloudDownload className="w-2.5 h-2.5 text-blue-405" />
            <span>Download</span>
          </button>
        );
      }

      return (
        <button
          onClick={() => handleSelectLocalFolderForProject(p)}
          className="flex items-center gap-1 bg-yellow-950/20 hover:bg-yellow-900/20 text-yellow-300 text-[10px] font-semibold px-2 py-1 rounded border border-yellow-900/40 cursor-pointer"
        >
          <FolderOpen className="w-2.5 h-2.5 text-yellow-400" />
          <span>Select Folder</span>
        </button>
      );
    } else {
      // "md" size (Grid view)
      const btnClass = "w-full bg-zinc-805 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold py-2 rounded-md border border-zinc-700/60 transition-colors flex items-center justify-center gap-2";
      const cloudBtnClass = "w-full bg-blue-950/45 hover:bg-blue-900/45 text-blue-205 text-xs font-semibold py-2 rounded-md border border-blue-900/50 transition-colors flex items-center justify-center gap-2 mt-2";

      if (isDownloading) {
        return (
          <button disabled className={btnClass + " opacity-65 cursor-not-allowed mt-5"}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>Downloading build...</span>
          </button>
        );
      }
      if (isUploading) {
        return (
          <button disabled className={btnClass + " opacity-65 cursor-not-allowed mt-5"}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>Uploading ZIP...</span>
          </button>
        );
      }

      if (isLocalValid) {
        return (
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => setSelectedProject(p)}
              className={btnClass + " bg-zinc-800 hover:bg-zinc-750 border-zinc-700/80 text-zinc-100"}
            >
              <Play className="w-3.5 h-3.5 fill-current text-emerald-450" />
              <span>Launch & QA Playtest</span>
            </button>
            <button
              onClick={() => handleUploadZip(p)}
              className={cloudBtnClass}
            >
              <CloudUpload className="w-3.5 h-3.5 text-blue-400" />
              <span>Upload ZIP to Cloud</span>
            </button>
          </div>
        );
      }

      if (p.buildZipUrl) {
        return (
          <button
            onClick={() => handleDownloadZip(p)}
            className={btnClass + " bg-blue-950/60 hover:bg-blue-900/70 text-blue-200 border-blue-900/80 mt-5"}
          >
            <CloudDownload className="w-3.5 h-3.5 text-blue-400" />
            <span>Download & Play locally</span>
          </button>
        );
      }

      return (
        <button
          onClick={() => handleSelectLocalFolderForProject(p)}
          className={btnClass + " bg-yellow-950/20 hover:bg-yellow-900/20 text-yellow-350 border-yellow-900/40 mt-5"}
        >
          <FolderOpen className="w-3.5 h-3.5 text-yellow-400" />
          <span>Select local build folder</span>
        </button>
      );
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOpenNewProject = () => {
    setProjName("");
    setProjFolder("");
    setProjFtpHost("");
    setProjFtpUser("");
    setProjFtpPass("");
    setProjFtpDomain("");
    setProjBaseDir("public_html");
    setProjInjectMode("none");
    setProjUploadMode("full");
    setProjUploadHtaccess(true);
    setIsEditing(false);
    setShowNewProjectModal(true);
  };

  const handleOpenEditProject = (p: any) => {
    setSelectedProject(p);
    setProjName(p.name);
    setProjFolder(localPaths[p.name]?.path || p.buildFolder || "");
    setProjFtpHost(p.ftpHost || "");
    setProjFtpUser(p.ftpUser || "");
    setProjFtpPass(p.ftpPass || "");
    setProjFtpDomain(p.ftpDomain || "");
    setProjBaseDir(p.baseDir || "public_html");
    setProjInjectMode(p.injectMode || "none");
    setProjUploadMode(p.uploadMode || "full");
    setProjUploadHtaccess(p.uploadHtaccess !== false);
    setIsEditing(true);
    setShowNewProjectModal(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) {
      showToast("Project Name is required.", "error");
      return;
    }

    try {
      if (projFolder.trim()) {
        // Validate path on local disk using Electron IPC
        const isValid = await (window as any).electron.ipcRenderer.invoke("validate-path", projFolder);
        if (!isValid) {
          showToast("The local build folder directory is invalid or not found.", "error");
          return;
        }
      }

      if (isEditing && selectedProject) {
        await updateProject({
          id: selectedProject._id,
          name: projName,
          buildFolder: projFolder || undefined,
          ftpHost: projFtpHost,
          ftpUser: projFtpUser,
          ftpPass: projFtpPass,
          ftpDomain: projFtpDomain,
          baseDir: projBaseDir,
          injectMode: projInjectMode,
          uploadMode: projUploadMode,
          uploadHtaccess: projUploadHtaccess,
        });
        if (projFolder.trim()) {
          await (window as any).electron.ipcRenderer.invoke("save-local-path", projName, projFolder);
        }
        showToast("Project updated successfully!");
      } else {
        await addProject({
          name: projName,
          buildFolder: projFolder || undefined,
          ftpHost: projFtpHost,
          ftpUser: projFtpUser,
          ftpPass: projFtpPass,
          ftpDomain: projFtpDomain,
          baseDir: projBaseDir,
          injectMode: projInjectMode,
          uploadMode: projUploadMode,
          uploadHtaccess: projUploadHtaccess,
        });
        if (projFolder.trim()) {
          await (window as any).electron.ipcRenderer.invoke("save-local-path", projName, projFolder);
        }
        showToast("New project registered successfully!");
      }
      setShowNewProjectModal(false);
      await refreshLocalPaths();
    } catch (err: any) {
      showToast(err.message || "Failed to save project settings.", "error");
    }
  };

  const handleDeleteProject = async (id: Id<"projects">) => {
    if (window.confirm("Are you sure you want to delete this project registration?")) {
      try {
        await deleteProject({ id });
        showToast("Project deleted.");
      } catch (err: any) {
        showToast(err.message || "Failed to delete project.", "error");
      }
    }
  };

  // If Convex is not initialized, guide user
  if (!isConvexConfigured) {
    return <ConvexSetupGuide />;
  }

  // If a project is selected to run, show the runner screen
  if (selectedProject && activeTab === "projects" && !showNewProjectModal) {
    return (
      <WebGLRunner
        project={selectedProject}
        localPath={localPaths[selectedProject.name]?.path || ""}
        onClose={() => setSelectedProject(null)}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-4 right-4 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border border-zinc-800 z-[9999] transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === "error"
              ? "bg-red-950/80 text-red-200 border-red-900"
              : toast.type === "info"
                ? "bg-zinc-900/80 text-zinc-200"
                : "bg-emerald-950/80 text-emerald-200 border-emerald-900"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
          ) : toast.type === "info" ? (
            <AlertCircle className="w-5 h-5 text-zinc-400" />
          ) : (
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-zinc-900 bg-zinc-950 flex flex-col px-4 py-6 gap-6 shrink-0">
        {/* App Title */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Sliders className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">WebGL QA Suite</h1>
            <p className="text-[10px] text-zinc-500 font-medium">Desktop Automation</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-col gap-1 flex-1">
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === "projects"
                ? "bg-zinc-900 text-zinc-100 border border-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 border border-transparent"
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Projects Hub</span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === "analytics"
                ? "bg-zinc-900 text-zinc-100 border border-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 border border-transparent"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Session Analytics</span>
          </button>
          <button
            onClick={() => setActiveTab("bugs")}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === "bugs"
                ? "bg-zinc-900 text-zinc-100 border border-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 border border-transparent"
            }`}
          >
            <Bug className="w-4 h-4" />
            <span>QA Bug Database</span>
          </button>
        </nav>

        {/* Footer info panel */}
        <div className="bg-zinc-900/40 border border-zinc-900/80 rounded-lg p-3 text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span>Database:</span>
            <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono">Convex</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-medium text-zinc-400">Bridge Port: 8000</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto max-h-screen">
        {activeTab === "projects" && (
          <div className="flex flex-col gap-6">
            {/* Header section */}
            <div className="flex justify-between items-center border-b border-zinc-900 pb-5">
              <div>
                <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Projects Hub</h2>
                <p className="text-sm text-zinc-400 mt-1">Manage and test registered local Unity WebGL builds</p>
              </div>
              <div className="flex items-center gap-3">
                {/* View Mode Toggle */}
                {projects && projects.length > 0 && (
                  <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 shadow-inner">
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded transition-all ${
                        viewMode === "grid"
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                      title="Grid View"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded transition-all ${
                        viewMode === "list"
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                      title="List/Table View"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <button
                  onClick={handleOpenNewProject}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-zinc-100 text-xs font-semibold px-4 py-2 rounded-md transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Local Build</span>
                </button>
              </div>
            </div>

            {/* Content grid */}
            {projects === undefined ? (
              <div className="flex justify-center items-center h-48 text-sm text-zinc-500">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading project list...
              </div>
            ) : projects.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-lg p-12 text-center flex flex-col items-center gap-4 bg-zinc-900/10">
                <div className="w-12 h-12 rounded-full bg-zinc-900/60 border border-zinc-800 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5 text-zinc-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">No WebGL Projects Registered</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                    Add a mapping to a local Unity WebGL directory to allow testing viewport overrides and overlay script injections.
                  </p>
                </div>
                <button
                  onClick={handleOpenNewProject}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-4 py-2 rounded-md border border-zinc-700 transition-colors"
                >
                  Register First Project
                </button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p: any) => {
                  const projectSessions = allSessions?.filter((s: any) => s.projectName === p.name) || [];
                  const projectBugs = allBugs?.filter((b: any) => b.projectName === p.name) || [];
                  const totalPlaySeconds = projectSessions.reduce((acc: number, curr: any) => acc + curr.duration, 0);
                  const totalPlayMin = Math.round(totalPlaySeconds / 60);

                  return (
                    <div
                      key={p._id}
                      className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-5 flex flex-col justify-between hover:border-zinc-700/80 transition-all group"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-semibold text-zinc-200 tracking-tight group-hover:text-zinc-100">
                            {p.name}
                          </h3>
                          <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenEditProject(p)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-880 rounded transition-colors"
                              title="Edit config"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProject(p._id)}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors"
                              title="Delete project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Local path Display */}
                        <div className="text-[11px] text-zinc-400">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Local Path</span>
                            {localPaths[p.name]?.isValid ? (
                              <span className="text-[9px] bg-emerald-950/50 text-emerald-400 border border-emerald-900/60 px-1.5 py-0.5 rounded font-semibold uppercase scale-90 origin-right">Local</span>
                            ) : p.buildZipUrl ? (
                              <span className="text-[9px] bg-blue-950/50 text-blue-400 border border-blue-900/60 px-1.5 py-0.5 rounded font-semibold uppercase scale-90 origin-right">Cloud Build</span>
                            ) : (
                              <span className="text-[9px] bg-red-950/50 text-red-400 border border-red-900/60 px-1.5 py-0.5 rounded font-semibold uppercase scale-90 origin-right">Missing</span>
                            )}
                          </div>
                          <div className={`mt-1 bg-zinc-950 border px-2 py-1.5 rounded text-xs font-mono truncate ${localPaths[p.name]?.isValid ? 'border-zinc-850/80 text-zinc-300' : 'border-red-950/40 text-zinc-500'}`} title={localPaths[p.name]?.path || "No local path set"}>
                            {localPaths[p.name]?.path || "No local path set"}
                          </div>
                        </div>

                        {/* Meta Tags */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className="flex items-center gap-1 text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                            <Clock className="w-2.5 h-2.5 text-blue-400" />
                            <span>{totalPlayMin}m played</span>
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                            <Database className="w-2.5 h-2.5 text-emerald-400" />
                            <span>{projectSessions.length} sessions</span>
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                            <Bug className="w-2.5 h-2.5 text-red-400" />
                            <span>{projectBugs.length} bugs</span>
                          </span>
                        </div>
                      </div>

                      {renderProjectActions(p, "md")}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-zinc-900/30 border border-zinc-805/80 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-400">
                        <th className="px-5 py-3 font-semibold text-zinc-300">Project Name</th>
                        <th className="px-5 py-3 font-semibold text-zinc-300">Local Absolute Build Path</th>
                        <th className="px-5 py-3 font-semibold text-center text-zinc-300">Playtime</th>
                        <th className="px-5 py-3 font-semibold text-center text-zinc-300">Sessions</th>
                        <th className="px-5 py-3 font-semibold text-center text-zinc-300">Bugs</th>
                        <th className="px-5 py-3 font-semibold text-right text-zinc-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/60">
                      {projects.map((p: any) => {
                        const projectSessions = allSessions?.filter((s: any) => s.projectName === p.name) || [];
                        const projectBugs = allBugs?.filter((b: any) => b.projectName === p.name) || [];
                        const totalPlaySeconds = projectSessions.reduce((acc: number, curr: any) => acc + curr.duration, 0);
                        const totalPlayMin = Math.round(totalPlaySeconds / 60);

                        return (
                          <tr key={p._id} className="hover:bg-zinc-900/20 group transition-colors">
                            <td className="px-5 py-3.5 font-semibold text-zinc-250 max-w-[180px] truncate">
                              {p.name}
                            </td>
                            <td className="px-5 py-3.5 font-mono max-w-[320px] truncate text-xs" title={localPaths[p.name]?.path || "No local path set"}>
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${localPaths[p.name]?.isValid ? 'bg-emerald-400' : p.buildZipUrl ? 'bg-blue-400 animate-pulse' : 'bg-red-400'}`} />
                                <span className={localPaths[p.name]?.isValid ? "text-zinc-300" : "text-zinc-500"}>
                                  {localPaths[p.name]?.path || "No local path set"}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-[10px]">
                                <Clock className="w-2.5 h-2.5 text-blue-400" />
                                <span>{totalPlayMin}m</span>
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-[10px]">
                                <Database className="w-2.5 h-2.5 text-emerald-400" />
                                <span>{projectSessions.length}</span>
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full text-[10px]">
                                <Bug className="w-2.5 h-2.5 text-red-400" />
                                <span>{projectBugs.length}</span>
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2.5">
                                {renderProjectActions(p, "sm")}
                                <button
                                  onClick={() => handleOpenEditProject(p)}
                                  className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                                  title="Edit config"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProject(p._id)}
                                  className="p-1 text-zinc-400 hover:text-red-405 hover:bg-red-950/30 rounded transition-colors cursor-pointer"
                                  title="Delete project"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "analytics" && (
          <SessionAnalytics allSessions={allSessions || []} projects={projects || []} />
        )}

        {activeTab === "bugs" && (
          <BugDatabase bugReports={allBugs || []} />
        )}
      </main>

      {/* New/Edit Project Modal Overlay */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-lg shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 px-5 py-4">
              <h3 className="text-sm font-semibold text-zinc-100">
                {isEditing ? "Edit WebGL Project Setup" : "Register Local WebGL Folder"}
              </h3>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProject} className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Project Name</label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="e.g. comp_brick_test"
                  className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Local Absolute Build Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={projFolder}
                    onChange={(e) => setProjFolder(e.target.value)}
                    placeholder="/Users/Name/Desktop/Project/Build"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-100 font-mono placeholder-zinc-650 focus:outline-none focus:border-zinc-650"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const path = await (window as any).electron.ipcRenderer.invoke("select-folder");
                        if (path) {
                          setProjFolder(path);
                          // Auto fill project name from folder base name if name is empty
                          if (!projName.trim()) {
                            const baseName = path.split(/[/\\]/).pop();
                            if (baseName) {
                              setProjName(baseName);
                            }
                          }
                        }
                      } catch (err) {
                        showToast("Failed to open folder selection dialog.", "error");
                      }
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-2 rounded border border-zinc-700 transition-colors shrink-0 cursor-pointer"
                  >
                    Browse...
                  </button>
                </div>
                <span className="text-[10px] text-zinc-500">
                  Folder must contain index.html and standard Build / TemplateData sub-directories.
                </span>
              </div>

              <div className="border-t border-zinc-800 pt-4 mt-2">
                <h4 className="text-xs font-semibold text-zinc-200 mb-3 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                  <span>FTP Deployment Config</span>
                </h4>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase">FTP Host</label>
                    <input
                      type="text"
                      value={projFtpHost}
                      onChange={(e) => setProjFtpHost(e.target.value)}
                      placeholder="ftp.yourdomain.com"
                      className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase">FTP Username</label>
                    <input
                      type="text"
                      value={projFtpUser}
                      onChange={(e) => setProjFtpUser(e.target.value)}
                      placeholder="user123"
                      className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase">FTP Password</label>
                    <input
                      type="password"
                      value={projFtpPass}
                      onChange={(e) => setProjFtpPass(e.target.value)}
                      placeholder="••••••••"
                      className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase">Web Domain URL</label>
                    <input
                      type="text"
                      value={projFtpDomain}
                      onChange={(e) => setProjFtpDomain(e.target.value)}
                      placeholder="yourdomain.com"
                      className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4 mt-3">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="bg-zinc-950 border border-zinc-850 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold px-5 py-2 rounded-md transition-colors shadow"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- WebGL Runner (Iframe + QA Overlay) ---------------- */
interface RunnerProps {
  project: any;
  localPath: string;
  onClose: () => void;
  showToast: (m: string, t?: "success" | "error" | "info") => void;
}

function WebGLRunner({ project, localPath, onClose, showToast }: RunnerProps) {
  const sessionTimer = useRef<number>(Date.now());
  const logSession = useMutation(api.sessions.add);

  const [activeFixes, setActiveFixes] = useState<{ [key: string]: boolean }>({
    mobile_responsive: false,
    error_overlay: false,
  });

  const [iframeKey, setIframeKey] = useState(0);

  // Screen recorder states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);

  // Bug report fields
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [bugCategory, setBugCategory] = useState("Visual");
  const [bugSeverity, setBugSeverity] = useState("Medium");
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const getUploadUrl = useMutation(api.bug_reports.generateUploadUrl);
  const submitBugReport = useMutation(api.bug_reports.add);

  useEffect(() => {
    sessionTimer.current = Date.now();
    return () => {
      const durationSeconds = Math.round((Date.now() - sessionTimer.current) / 1000);
      if (durationSeconds > 2) {
        logSession({
          projectName: project.name,
          startTime: sessionTimer.current,
          duration: durationSeconds,
        }).catch((err) => console.error("Error logging session:", err));
      }
    };
  }, [project.name]);

  const handleApplyFix = async (fixType: string) => {
    try {
      const data = await (window as any).electron.ipcRenderer.invoke("apply-fix", {
        buildFolder: localPath,
        fixType: fixType,
      });
      if (data.success) {
        setActiveFixes((prev) => ({ ...prev, [fixType]: true }));
        showToast(`${fixType.replace("_", " ")} fix applied to index.html`);
        setIframeKey((prev) => prev + 1);
      } else {
        showToast(data.error || "Failed to apply fix", "error");
      }
    } catch (e: any) {
      showToast("Failed to communicate with local bridge.", "error");
    }
  };

  const handleRevertFix = async (fixType: string) => {
    try {
      const data = await (window as any).electron.ipcRenderer.invoke("revert-fix", {
        buildFolder: localPath,
        fixType: fixType,
      });
      if (data.success) {
        setActiveFixes((prev) => ({ ...prev, [fixType]: false }));
        showToast(`${fixType.replace("_", " ")} fix reverted.`);
        setIframeKey((prev) => prev + 1);
      } else {
        showToast(data.error || "Failed to revert fix", "error");
      }
    } catch (e: any) {
      showToast("Failed to communicate with local bridge.", "error");
    }
  };

  const handleToggleFix = (fixType: string) => {
    if (activeFixes[fixType]) {
      handleRevertFix(fixType);
    } else {
      handleApplyFix(fixType);
    }
  };

  const handleStartRecording = async () => {
    try {
      setRecordedChunks([]);
      setRecordedVideoBlob(null);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const options = { mimeType: "video/webm; codecs=vp9" };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      showToast("Recording started. Interact with the build window below.", "info");
    } catch (err: any) {
      showToast("Failed to start display capture.", "error");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      showToast("Recording captured.");
    }
  };

  useEffect(() => {
    if (recordedChunks.length > 0 && !isRecording) {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      setRecordedVideoBlob(blob);
    }
  }, [recordedChunks, isRecording]);

  const handleCaptureScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setScreenshotBlob(blob);
            showToast("Frame screenshot grabbed!", "success");
          }
        }, "image/png");
      }
    } catch (err) {
      showToast("Failed to grab video frame.", "error");
    }
  };

  const handleSubmitBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim() || !bugDesc.trim()) {
      showToast("Title and Description are required.", "error");
      return;
    }

    setIsSubmittingBug(true);
    showToast("Submitting QA bug report...", "info");

    try {
      let screenshotStorageId: Id<"_storage"> | undefined;
      let videoStorageId: Id<"_storage"> | undefined;

      if (screenshotBlob) {
        const uploadUrl = await getUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: screenshotBlob,
        });
        const data = await res.json();
        screenshotStorageId = data.storageId;
      }

      if (recordedVideoBlob) {
        const uploadUrl = await getUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "video/webm" },
          body: recordedVideoBlob,
        });
        const data = await res.json();
        videoStorageId = data.storageId;
      }

      await submitBugReport({
        projectName: project.name,
        title: bugTitle,
        description: bugDesc,
        category: bugCategory,
        severity: bugSeverity,
        screenshotId: screenshotStorageId,
        videoId: videoStorageId,
        timestamp: Date.now(),
      });

      showToast("Bug uploaded successfully!");
      setBugTitle("");
      setBugDesc("");
      setScreenshotBlob(null);
      setRecordedVideoBlob(null);
      setRecordedChunks([]);
    } catch (err: any) {
      showToast("Failed to submit bug report.", "error");
    } finally {
      setIsSubmittingBug(false);
    }
  };

  const playUrl = `http://localhost:8000/project-builds/${project.name}/index.html`;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Header bar */}
      <header className="h-14 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between px-5 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded border border-zinc-850 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Exit Runner</span>
          </button>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-zinc-200">Runner: {project.name}</span>
            <span className="text-[9px] text-zinc-500 font-mono truncate max-w-sm">{localPath}</span>
          </div>
        </div>

        <SessionTimerWidget />
      </header>

      {/* Main Split Panels */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: WebGL Viewport Container */}
        <div className="flex-1 bg-black p-4 flex items-center justify-center">
          <div className="w-full h-full max-w-[1280px] max-h-[720px] aspect-video border border-zinc-850 rounded-lg overflow-hidden shadow-2xl relative bg-zinc-950">
            <iframe
              key={iframeKey}
              src={playUrl}
              title={project.name}
              className="w-full h-full border-none bg-black"
              allow="autoplay; fullscreen; keyboard"
            />
          </div>
        </div>

        {/* Floating Expand Sidebar Button */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute right-6 top-6 z-20 flex items-center gap-2 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white px-3.5 py-2 rounded-lg border border-zinc-800 shadow-xl backdrop-blur-md transition-all cursor-pointer font-semibold text-xs active:scale-95 hover:border-zinc-700"
          >
            <Sliders className="w-4 h-4 text-blue-500 animate-pulse" />
            <span>Open QA Panel</span>
          </button>
        )}

        {/* Right Toolset Sidebar */}
        <aside
          className={`absolute right-4 top-4 bottom-4 w-80 bg-zinc-950/95 border border-zinc-850 rounded-xl shadow-2xl flex flex-col z-30 transition-all duration-300 ease-in-out select-none backdrop-blur-sm ${
            isSidebarOpen ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+1.5rem)] opacity-0 pointer-events-none"
          }`}
        >
          {/* Sidebar Header */}
          <div className="p-4 border-b border-zinc-900 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                QA Toolset Panel
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-zinc-400 hover:text-zinc-250 p-1 hover:bg-zinc-900 rounded transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Scrollable Container Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Style/Script Overrides Card */}
            <div className="p-4 border-b border-zinc-900 flex flex-col gap-3">
              <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                <span>QA Styles & Scripts Injections</span>
              </h4>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 px-3 py-2 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-850 rounded text-xs font-medium cursor-pointer transition-colors text-zinc-300">
                  <input
                    type="checkbox"
                    checked={activeFixes.mobile_responsive}
                    onChange={() => handleToggleFix("mobile_responsive")}
                    className="rounded bg-zinc-950 border-zinc-800 text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span>Mobile Viewport Patch</span>
                </label>

                <label className="flex items-center gap-2 px-3 py-2 bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-850 rounded text-xs font-medium cursor-pointer transition-colors text-zinc-300">
                  <input
                    type="checkbox"
                    checked={activeFixes.error_overlay}
                    onChange={() => handleToggleFix("error_overlay")}
                    className="rounded bg-zinc-950 border-zinc-800 text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span>In-Game Console Error Overlay</span>
                </label>
              </div>
              <p className="text-[9px] text-zinc-500 leading-normal">
                Applies responsive CSS/JS scripts to local files instantly and reloads the iframe window automatically.
              </p>
            </div>

            {/* Media Capture Toolset */}
            <div className="p-4 border-b border-zinc-900 flex flex-col gap-3">
              <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-zinc-400" />
                <span>Media Attachments Recorder</span>
              </h4>

              <div className="flex gap-2">
                {isRecording ? (
                  <button
                    onClick={handleStopRecording}
                    className="flex-1 bg-red-650 hover:bg-red-500 text-white text-xs font-semibold py-1.5 rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full bg-white recording-pulse"></span>
                    <span>Stop Capture</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStartRecording}
                    className="flex-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-semibold py-1.5 rounded border border-zinc-850 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Record Video</span>
                  </button>
                )}

                <button
                  onClick={handleCaptureScreenshot}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 text-xs font-semibold py-1.5 rounded border border-zinc-850 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Screenshot</span>
                </button>
              </div>

              {/* Media Status Badges */}
              <div className="flex flex-col gap-1 text-[10px] font-medium text-emerald-400">
                {screenshotBlob && (
                  <div className="flex justify-between items-center bg-emerald-950/20 border border-emerald-900/40 rounded px-2.5 py-1">
                    <span>📸 Screenshot Ready</span>
                    <button
                      onClick={() => setScreenshotBlob(null)}
                      className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {recordedVideoBlob && (
                  <div className="flex justify-between items-center bg-emerald-950/20 border border-emerald-900/40 rounded px-2.5 py-1">
                    <span>🎥 Video Clip Ready</span>
                    <button
                      onClick={() => setRecordedVideoBlob(null)}
                      className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bug Reporter Form */}
            <div className="p-4 flex flex-col gap-3">
              <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Bug className="w-3.5 h-3.5 text-zinc-400" />
                <span>Log a Bug Report</span>
              </h4>

              <form onSubmit={handleSubmitBug} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 font-semibold uppercase">Title</label>
                  <input
                    type="text"
                    required
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    placeholder="Physics collision boundary fail..."
                    className="bg-zinc-950 border border-zinc-850 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-750 focus:outline-none focus:border-zinc-700 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 font-semibold uppercase">Category</label>
                    <select
                      value={bugCategory}
                      onChange={(e) => setBugCategory(e.target.value)}
                      className="bg-zinc-950 border border-zinc-850 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="Visual">Visual</option>
                      <option value="Audio">Audio</option>
                      <option value="Physics">Physics</option>
                      <option value="Script Error">Script Error</option>
                      <option value="Performance">Performance</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 font-semibold uppercase">Severity</label>
                    <select
                      value={bugSeverity}
                      onChange={(e) => setBugSeverity(e.target.value)}
                      className="bg-zinc-950 border border-zinc-850 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 font-semibold uppercase">Steps & Details</label>
                  <textarea
                    required
                    value={bugDesc}
                    onChange={(e) => setBugDesc(e.target.value)}
                    placeholder="Describe exception trace or reproduction steps..."
                    className="bg-zinc-950 border border-zinc-850 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-750 focus:outline-none focus:border-zinc-700 resize-none min-h-[90px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingBug}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-zinc-100 text-xs font-semibold py-2 rounded-md transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isSubmittingBug ? "Uploading..." : "Save Bug Report"}</span>
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Session Timer Widget
function SessionTimerWidget() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-850 px-3 py-1.5 rounded-full">
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
      <span className="text-xs font-semibold font-mono text-zinc-300">Session: {formatTime(seconds)}</span>
    </div>
  );
}

/* ---------------- Session Analytics Tab ---------------- */
interface AnalyticsProps {
  allSessions: any[];
  projects: any[];
}

function SessionAnalytics({ allSessions }: AnalyticsProps) {
  const totalSessionsCount = allSessions.length;
  const totalDurationSeconds = allSessions.reduce((acc: number, curr: any) => acc + curr.duration, 0);
  const totalPlayMinutes = Math.round(totalDurationSeconds / 60);
  const avgSessionSeconds = totalSessionsCount > 0 ? Math.round(totalDurationSeconds / totalSessionsCount) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-zinc-900 pb-5">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Session Analytics</h2>
        <p className="text-sm text-zinc-400 mt-1">Play sessions length tracking logs</p>
      </div>

      {/* Analytics stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Total Play Sessions</span>
          <div className="text-2xl font-bold text-zinc-100 mt-1.5">{totalSessionsCount}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Total Playtime</span>
          <div className="text-2xl font-bold text-zinc-100 mt-1.5">
            {totalPlayMinutes} <span className="text-xs text-zinc-400 font-medium font-sans">minutes</span>
          </div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Avg Session Length</span>
          <div className="text-2xl font-bold text-zinc-100 mt-1.5">
            {avgSessionSeconds} <span className="text-xs text-zinc-400 font-medium font-sans">seconds</span>
          </div>
        </div>
      </div>

      {/* Analytics Table */}
      <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-lg overflow-hidden mt-2">
        <div className="px-5 py-4 border-b border-zinc-900 bg-zinc-900/50">
          <h3 className="text-xs font-semibold text-zinc-300">Play History Logs</h3>
        </div>
        {allSessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">No play logs captured.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-450">
                  <th className="px-5 py-3 font-semibold text-zinc-400">Project</th>
                  <th className="px-5 py-3 font-semibold text-zinc-400">Timestamp</th>
                  <th className="px-5 py-3 font-semibold text-zinc-400">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60">
                {allSessions.map((s) => (
                  <tr key={s._id} className="hover:bg-zinc-900/20">
                    <td className="px-5 py-3 font-medium text-zinc-200">{s.projectName}</td>
                    <td className="px-5 py-3 text-zinc-450">{new Date(s.startTime).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono font-semibold text-zinc-300">
                      {Math.floor(s.duration / 60)}m {s.duration % 60}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- QA Bug Database Tab ---------------- */
interface BugDbProps {
  bugReports: any[];
}

function BugDatabase({ bugReports }: BugDbProps) {
  const [selectedBug, setSelectedBug] = useState<any>(null);

  const getSeverityBadgeClass = (sev: string) => {
    switch (sev.toLowerCase()) {
      case "critical":
        return "bg-red-950/60 border-red-900 text-red-400";
      case "high":
        return "bg-orange-950/60 border-orange-900 text-orange-400";
      case "medium":
        return "bg-amber-950/60 border-amber-900 text-amber-400";
      default:
        return "bg-emerald-950/60 border-emerald-900 text-emerald-400";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-zinc-900 pb-5">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Bug Database</h2>
        <p className="text-sm text-zinc-400 mt-1">Inspected bug reports with file recordings and details</p>
      </div>

      {bugReports.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-lg p-12 text-center text-zinc-500 text-sm">
          No QA bugs submitted. Bug reports appear once recorded playtests are logged.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column list */}
          <div className="lg:col-span-1 border border-zinc-850 rounded-lg overflow-hidden flex flex-col bg-zinc-900/20 max-h-[68vh]">
            <div className="px-4 py-3 border-b border-zinc-850 bg-zinc-900/40 text-xs font-semibold text-zinc-300">
              Bug Logs ({bugReports.length})
            </div>
            <div className="overflow-y-auto flex flex-col divide-y divide-zinc-850">
              {bugReports.map((b) => (
                <div
                  key={b._id}
                  onClick={() => setSelectedBug(b)}
                  className={`p-3.5 cursor-pointer text-left transition-colors ${
                    selectedBug?._id === b._id ? "bg-zinc-900" : "hover:bg-zinc-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[9px] font-semibold font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400">
                      {b.projectName}
                    </span>
                    <span className="text-[9px] font-mono uppercase tracking-wider">{b.category}</span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-200 truncate">{b.title}</h4>
                  <div className="flex justify-between items-center mt-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getSeverityBadgeClass(b.severity)}`}>
                      {b.severity}
                    </span>
                    <span className="text-[10px] text-zinc-500">{new Date(b.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column details */}
          <div className="lg:col-span-2 border border-zinc-850 rounded-lg p-5 bg-zinc-900/10 min-h-[400px]">
            {selectedBug ? (
              <div className="flex flex-col gap-5">
                <div className="border-b border-zinc-900 pb-4">
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <span className="bg-blue-950/40 border border-blue-900/60 px-2 py-0.5 rounded text-[10px] text-blue-400 font-semibold font-mono">
                      {selectedBug.projectName}
                    </span>
                    <span className={`border px-2 py-0.5 rounded-full text-[10px] font-semibold ${getSeverityBadgeClass(selectedBug.severity)}`}>
                      {selectedBug.severity}
                    </span>
                    <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-[10px] text-zinc-400">
                      {selectedBug.category}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-zinc-100">{selectedBug.title}</h3>
                  <span className="text-[10px] text-zinc-500 block mt-1">
                    Submitted on: {new Date(selectedBug.timestamp).toLocaleString()}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Description & Reproduction</label>
                  <div className="bg-zinc-950/80 border border-zinc-850 p-4 rounded text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                    {selectedBug.description}
                  </div>
                </div>

                {/* Evidence attachments */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">📸 Screenshot Proof</label>
                    {selectedBug.screenshotUrl ? (
                      <a href={selectedBug.screenshotUrl} target="_blank" rel="noreferrer" className="block border border-zinc-800 hover:border-zinc-700 rounded overflow-hidden shadow">
                        <img
                          src={selectedBug.screenshotUrl}
                          alt="Screenshot file"
                          className="w-full aspect-video object-cover transition-opacity hover:opacity-90"
                        />
                      </a>
                    ) : (
                      <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded aspect-video flex items-center justify-center text-[10px] text-zinc-500">
                        No Screenshot evidence
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">🎥 Video Recording</label>
                    {selectedBug.videoUrl ? (
                      <div className="border border-zinc-800 rounded overflow-hidden shadow aspect-video bg-black flex items-center">
                        <video src={selectedBug.videoUrl} controls className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="bg-zinc-950/40 border border-dashed border-zinc-800 rounded aspect-video flex items-center justify-center text-[10px] text-zinc-500">
                        No Screen Recording evidence
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center items-center gap-3 text-zinc-500 text-xs py-16">
                <AlertTriangle className="w-6 h-6 text-zinc-650" />
                <span>Select a bug report from the list to view reproduction details and file playbacks.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Convex Setup Guide View ---------------- */
function ConvexSetupGuide() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100 font-sans p-6">
      <div className="w-full max-w-md border border-zinc-800 rounded-lg bg-zinc-900/60 p-6 flex flex-col gap-5 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="text-3xl">☁️</div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Database Connection Required</h2>
            <p className="text-[10px] text-zinc-500 font-medium">WebGL Automation QA Suite</p>
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-normal">
          To log playtime sessions, manage bug reports, and upload screen recordings, you must connect this codebase to your Convex cloud project.
        </p>

        <div className="bg-zinc-950 border border-zinc-850 p-4 rounded text-xs flex flex-col gap-3">
          <span className="font-semibold text-zinc-300">Run the following commands:</span>
          <ol className="list-decimal pl-4 flex flex-col gap-2.5 text-zinc-400">
            <li>
              Open a terminal window and route to this directory:
              <code className="block mt-1 font-mono text-[10px] text-blue-400 bg-zinc-900 border border-zinc-850 px-2 py-1 rounded">
                cd "/Users/Yokesh_Work/Desktop/Unity WebGL Automation"
              </code>
            </li>
            <li>
              Initiate the connection profile:
              <code className="block mt-1 font-mono text-[10px] text-blue-400 bg-zinc-900 border border-zinc-850 px-2 py-1 rounded">
                npx convex dev
              </code>
            </li>
            <li>
              Log in via your web browser and setup the workspace tables.
            </li>
          </ol>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-850 pt-4 mt-2">
          <span className="text-[10px] text-zinc-500">Awaiting environment variables</span>
          <button
            onClick={() => window.location.reload()}
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Refresh Interface
          </button>
        </div>
      </div>
    </div>
  );
}
