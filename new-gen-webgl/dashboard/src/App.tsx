import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  LayoutDashboard,
  Play,
  Bug,
  Code2,
  Clock,
  Database,
  Calendar,
  AlertCircle,
  Trash2,
  Plus,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  X,
  CheckCircle,
  HelpCircle
} from "lucide-react";
import type { Doc } from "../../convex/_generated/dataModel";

export default function App() {
  const [activeTab, setActiveTab] = useState<"projects" | "analytics" | "bugs">("projects");
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);

  // Modal State
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjDesc, setNewProjDesc] = useState("");

  // Convex Queries and Mutations
  const projects = useQuery(api.projects.get);
  const sessions = useQuery(api.sessions.get);
  const bugs = useQuery(api.bug_reports.get);

  const addProject = useMutation(api.projects.add);
  const deleteProject = useMutation(api.projects.remove);

  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) {
      showToast("Project Name is required", "error");
      return;
    }
    try {
      await addProject({
        name: newProjName.trim(),
        description: newProjDesc.trim() || undefined,
      });
      showToast("Project registered successfully!");
      setShowAddProjectModal(false);
      setNewProjName("");
      setNewProjDesc("");
    } catch (err: any) {
      showToast(err.message || "Failed to register project", "error");
    }
  };

  const handleDeleteProject = async (id: any) => {
    if (window.confirm("Are you sure you want to delete this project registration? This won't delete recorded bugs or sessions, but removes the project from the list.")) {
      try {
        await deleteProject({ id });
        showToast("Project removed.");
        setSelectedProjectName(null);
      } catch (err: any) {
        showToast("Failed to delete project", "error");
      }
    }
  };

  // Helper selectors
  const projectList = projects || [];
  const sessionList = sessions || [];
  const bugList = bugs || [];

  // Filter logs by selected project
  const filteredSessions = selectedProjectName
    ? sessionList.filter((s: Doc<"sessions">) => s.projectName === selectedProjectName)
    : sessionList;

  const filteredBugs = selectedProjectName
    ? bugList.filter((b: any) => b.projectName === selectedProjectName)
    : bugList;

  const activeBug = bugList.find((b: any) => b._id === selectedBugId) || null;

  // Aggregate Metrics
  const totalPlaySeconds = filteredSessions.reduce((acc: number, curr: Doc<"sessions">) => acc + curr.duration, 0);
  const totalPlayMinutes = Math.round(totalPlaySeconds / 60);
  const totalSessionsCount = filteredSessions.length;
  const avgSessionLengthSeconds = totalSessionsCount > 0 ? Math.round(totalPlaySeconds / totalSessionsCount) : 0;

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-4 right-4 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg border z-[9999] transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === "error"
              ? "bg-red-950/80 text-red-200 border-red-900"
              : "bg-emerald-950/80 text-emerald-200 border-emerald-900"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
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
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">WebGL QA Suite</h1>
            <p className="text-[10px] text-zinc-500 font-medium">Cloud Web Dashboard</p>
          </div>
        </div>

        {/* Global Project Filter */}
        <div className="px-2">
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Scope Project</label>
          <select
            value={selectedProjectName || ""}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedProjectName(val === "" ? null : val);
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 cursor-pointer"
          >
            <option value="">All Registered Projects</option>
            {projectList.map((p: Doc<"projects">) => (
              <option key={p._id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-col gap-1 flex-1">
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === "projects"
                ? "bg-zinc-900 text-zinc-100 border border-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 border border-transparent"
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Projects & Guides</span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === "analytics"
                ? "bg-zinc-900 text-zinc-100 border border-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 border border-transparent"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Session Analytics</span>
          </button>
          <button
            onClick={() => setActiveTab("bugs")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
              activeTab === "bugs"
                ? "bg-zinc-900 text-zinc-100 border border-zinc-800"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/40 border border-transparent"
            }`}
          >
            <Bug className="w-4 h-4" />
            <span>Bug Reports ({filteredBugs.length})</span>
          </button>
        </nav>

        {/* Footer info panel */}
        <div className="bg-zinc-900/40 border border-zinc-900/80 rounded-lg p-3.5 text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span>Server State:</span>
            <span className="text-[10px] bg-emerald-950/40 border border-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-400 font-semibold uppercase">Online</span>
          </div>
          <div className="text-[11px] text-zinc-500 leading-normal">
            Direct WebGL endpoints active for telemetry submission.
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto max-h-screen">
        {/* PROJECTS TAB */}
        {activeTab === "projects" && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-5">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-zinc-100">Projects & Integration Guides</h2>
                <p className="text-sm text-zinc-400 mt-1">Register projects and configure your Unity WebGL template</p>
              </div>
              <button
                onClick={() => setShowAddProjectModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors flex items-center gap-2 shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Add WebGL Project</span>
              </button>
            </div>

            {/* Project List Grid */}
            {projects === undefined ? (
              <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading projects...
              </div>
            ) : projectList.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-lg p-12 text-center flex flex-col items-center gap-4 bg-zinc-900/10">
                <LayoutDashboard className="w-10 h-10 text-zinc-600" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">No WebGL Games Registered</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                    Add a game registry item here to start listening for playtest session statistics and visual bug attachments.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddProjectModal(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-4 py-2 rounded-md border border-zinc-700 transition-colors"
                >
                  Create First Registry
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projectList.map((p: Doc<"projects">) => {
                  const projSessions = sessionList.filter((s: Doc<"sessions">) => s.projectName === p.name);
                  const projBugs = bugList.filter((b: any) => b.projectName === p.name);
                  const projPlayTime = Math.round(projSessions.reduce((acc: number, curr: Doc<"sessions">) => acc + curr.duration, 0) / 60);

                  return (
                    <div
                      key={p._id}
                      onClick={() => setSelectedProjectName(p.name)}
                      className={`bg-zinc-900/40 border rounded-lg p-5 flex flex-col justify-between hover:border-zinc-700 transition-all cursor-pointer group ${
                        selectedProjectName === p.name ? "border-blue-500/70 shadow-lg shadow-blue-500/5 bg-zinc-900/60" : "border-zinc-800/80"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="text-sm font-bold text-zinc-200 group-hover:text-zinc-100">{p.name}</h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(p._id);
                            }}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                            title="Delete project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-zinc-450 mt-1 line-clamp-2 min-h-[32px] leading-relaxed">
                          {p.description || "No description provided."}
                        </p>

                        <div className="flex flex-wrap gap-2 mt-4">
                          <span className="flex items-center gap-1.5 text-[10px] font-medium bg-zinc-950 border border-zinc-850 text-zinc-400 px-2 py-0.5 rounded-full">
                            <Clock className="w-2.5 h-2.5 text-blue-450" />
                            <span>{projPlayTime}m play</span>
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] font-medium bg-zinc-950 border border-zinc-850 text-zinc-400 px-2 py-0.5 rounded-full">
                            <Database className="w-2.5 h-2.5 text-emerald-450" />
                            <span>{projSessions.length} plays</span>
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] font-medium bg-zinc-950 border border-zinc-850 text-zinc-400 px-2 py-0.5 rounded-full">
                            <Bug className="w-2.5 h-2.5 text-red-450" />
                            <span>{projBugs.length} bugs</span>
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-550 group-hover:text-zinc-400">
                        <span>Click to view integration code</span>
                        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* INTEGRATION GUIDE SECTION */}
            <div className="mt-6 bg-zinc-900/20 border border-zinc-900 rounded-lg p-6">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 mb-3">
                <Code2 className="w-4.5 h-4.5 text-blue-500" />
                <span>Unity WebGL Template Integration Guide</span>
              </h3>
              
              <div className="space-y-4 text-xs text-zinc-400 leading-relaxed">
                <p>
                  Deploy the custom QA Panel directly inside your Unity WebGL builds in 3 simple steps:
                </p>
                
                <ol className="list-decimal list-inside space-y-3">
                  <li>
                    <strong>Install Template Wrapper</strong>: Copy the folder <code className="bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded font-mono border border-zinc-850 text-[11px]">template/QAWrapper</code> from this project directory and paste it into your Unity Project folder under:
                    <div className="mt-1 bg-zinc-950 border border-zinc-900 p-2.5 rounded font-mono text-zinc-300 text-[11px]">
                      Assets/WebGLTemplates/QAWrapper
                    </div>
                  </li>
                  <li>
                    <strong>Select WebGL Template in Unity</strong>: Inside Unity Editor, open <strong className="text-zinc-300">File &gt; Build Settings &gt; Player Settings &gt; Resolution and Presentation</strong>. Under WebGL Templates, select the newly added template named <strong className="text-zinc-300">QAWrapper</strong>.
                  </li>
                  <li>
                    <strong>Configure Cloud Target</strong>: Open the copied template's <code className="text-zinc-300 font-mono">index.html</code> file in your editor, locate the configuration code block, and verify that the target matches:
                    <div className="mt-2 bg-zinc-950 border border-zinc-900 p-3 rounded font-mono text-zinc-300 text-[11px] overflow-x-auto">
{`window.QA_CONFIG = {
  // Direct HTTP actions site endpoint of your Convex backend
  convexUrl: "https://festive-mandrill-69.convex.site",
  // Project registry name matching this dashboard
  projectName: "${selectedProjectName || "YOUR_PROJECT_NAME"}", 
  autoStartSession: true
};`}
                    </div>
                  </li>
                </ol>

                <div className="bg-blue-950/20 border border-blue-900/30 rounded p-4 text-[11px] text-blue-300 flex gap-2.5 mt-2">
                  <HelpCircle className="w-4.5 h-4.5 shrink-0 text-blue-400" />
                  <div>
                    <strong>Pro-Tip for Visual Bug Capture:</strong> To capture pixel-perfect screenshots directly from the WebGL Canvas context using `canvas.toBlob()`, make sure <code className="bg-blue-950/40 text-white px-1 py-0.5 rounded font-mono">preserveDrawingBuffer: true</code> is active in Unity's build config (this is pre-configured by default in our template's index.html loader).
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SESSION ANALYTICS TAB */}
        {activeTab === "analytics" && (
          <div className="flex flex-col gap-6">
            <div className="border-b border-zinc-900 pb-5">
              <h2 className="text-xl font-bold tracking-tight text-zinc-100">Session Playtest Analytics</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {selectedProjectName ? `Aggregated runtime statistics for project "${selectedProjectName}"` : "Aggregated statistics for all registered WebGL projects"}
              </p>
            </div>

            {/* Analytics Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-lg">
                <div className="flex justify-between items-center text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Play Sessions</span>
                  <Database className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-zinc-100 mt-2">{totalSessionsCount}</div>
                <div className="text-[10px] text-zinc-500 mt-1">Sessions logged via tab close lifecycle</div>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-lg">
                <div className="flex justify-between items-center text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Playtime</span>
                  <Clock className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-zinc-100 mt-2">{totalPlayMinutes}m</div>
                <div className="text-[10px] text-zinc-500 mt-1">Cumulative playtime across testers</div>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-lg">
                <div className="flex justify-between items-center text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Avg Session Duration</span>
                  <Calendar className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="text-2xl font-bold text-zinc-100 mt-2">
                  {avgSessionLengthSeconds > 60
                    ? `${Math.floor(avgSessionLengthSeconds / 60)}m ${avgSessionLengthSeconds % 60}s`
                    : `${avgSessionLengthSeconds}s`}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">Average run duration per instance</div>
              </div>
            </div>

            {/* Custom Flexbox Bar Chart for Project Activity Comparison */}
            {!selectedProjectName && projectList.length > 0 && (
              <div className="bg-zinc-900/20 border border-zinc-900 p-6 rounded-lg">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Playtime Distribution (Minutes)</h3>
                <div className="flex flex-col gap-4">
                  {projectList.map((p: Doc<"projects">) => {
                    const projSessions = sessionList.filter((s: Doc<"sessions">) => s.projectName === p.name);
                    const projPlayTime = Math.round(projSessions.reduce((acc: number, curr: Doc<"sessions">) => acc + curr.duration, 0) / 60);
                    // Calculate percentage width (cap max value to compute scale)
                    const maxTime = Math.max(...projectList.map((item: Doc<"projects">) => {
                      const count = sessionList.filter((s: Doc<"sessions">) => s.projectName === item.name);
                      return Math.round(count.reduce((acc: number, curr: Doc<"sessions">) => acc + curr.duration, 0) / 60);
                    }), 1);
                    const percent = Math.min(100, Math.max(8, (projPlayTime / maxTime) * 100));

                    return (
                      <div key={p._id} className="flex items-center gap-4 text-xs">
                        <span className="w-28 truncate font-semibold text-zinc-300">{p.name}</span>
                        <div className="flex-1 bg-zinc-950/80 border border-zinc-900/60 rounded h-6 overflow-hidden flex items-center">
                          <div
                            style={{ width: `${percent}%` }}
                            className="bg-blue-600 h-full rounded-r flex items-center justify-end px-2 text-[10px] font-bold text-white shadow-inner transition-all duration-500"
                          >
                            {projPlayTime > 0 ? `${projPlayTime}m` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sessions Log Table */}
            <div className="bg-zinc-900/30 border border-zinc-900 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Play Session History</h3>
                <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-semibold">{filteredSessions.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-zinc-550 bg-zinc-900/5">
                      <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]">Project Name</th>
                      <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px]">Session Start Time</th>
                      <th className="px-5 py-3 font-bold uppercase tracking-wider text-[10px] text-right">Active Play Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60 text-zinc-300">
                    {sessions === undefined ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-6 text-center text-zinc-500">
                          Loading session records...
                        </td>
                      </tr>
                    ) : filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-8 text-center text-zinc-500">
                          No play sessions logged yet. Apply the Unity template to begin telemetry.
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((s: Doc<"sessions">) => (
                        <tr key={s._id} className="hover:bg-zinc-900/20 transition-colors">
                          <td className="px-5 py-3 font-semibold text-zinc-200">{s.projectName}</td>
                          <td className="px-5 py-3 font-mono text-zinc-400">{new Date(s.startTime).toLocaleString()}</td>
                          <td className="px-5 py-3 text-right font-mono text-zinc-200">
                            {s.duration > 60
                              ? `${Math.floor(s.duration / 60)}m ${s.duration % 60}s`
                              : `${s.duration}s`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* BUG REPORTS DATABASE TAB */}
        {activeTab === "bugs" && (
          <div className="flex flex-col gap-6">
            <div className="border-b border-zinc-900 pb-5">
              <h2 className="text-xl font-bold tracking-tight text-zinc-100">QA Bug Database</h2>
              <p className="text-sm text-zinc-400 mt-1">
                {selectedProjectName ? `Logged bug submissions for project "${selectedProjectName}"` : "All logged bug reports"}
              </p>
            </div>

            {bugs === undefined ? (
              <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading reports...
              </div>
            ) : filteredBugs.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-lg p-12 text-center flex flex-col items-center gap-4 bg-zinc-900/10">
                <Bug className="w-10 h-10 text-zinc-650" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">No Bugs Logged</h3>
                  <p className="text-xs text-zinc-450 mt-1">
                    Playtesters have not submitted any bug reports yet.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-6 h-[calc(100vh-180px)] overflow-hidden">
                {/* Left pane: Bug List */}
                <div className="w-2/5 border border-zinc-900 rounded-lg bg-zinc-900/20 overflow-y-auto flex flex-col divide-y divide-zinc-900">
                  {filteredBugs.map((bug: any) => {
                    const isSelected = bug._id === selectedBugId;
                    const sevColors =
                      bug.severity === "Critical"
                        ? "bg-red-950/40 text-red-400 border-red-900/50"
                        : bug.severity === "High"
                          ? "bg-orange-950/40 text-orange-400 border-orange-900/50"
                          : bug.severity === "Medium"
                            ? "bg-yellow-950/40 text-yellow-400 border-yellow-900/50"
                            : "bg-zinc-800/40 text-zinc-400 border-zinc-700/50";

                    return (
                      <div
                        key={bug._id}
                        onClick={() => {
                          setSelectedBugId(bug._id);
                        }}
                        className={`p-4 cursor-pointer hover:bg-zinc-900/40 transition-colors flex flex-col gap-2 ${
                          isSelected ? "bg-zinc-900/50 border-l-2 border-blue-500" : ""
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <h4 className="text-xs font-bold text-zinc-250 truncate">{bug.title}</h4>
                          <span className={`text-[9px] border px-2 py-0.5 rounded font-bold uppercase ${sevColors}`}>
                            {bug.severity}
                          </span>
                        </div>
                        
                        <p className="text-[11px] text-zinc-450 line-clamp-2 leading-relaxed">
                          {bug.description}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                          <span className="font-semibold text-zinc-400">{bug.projectName}</span>
                          <span>{new Date(bug.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right pane: Bug Details */}
                <div className="flex-1 border border-zinc-900 rounded-lg bg-zinc-900/10 overflow-y-auto p-6 flex flex-col gap-5">
                  {activeBug ? (
                    <>
                      <div className="flex justify-between items-start border-b border-zinc-900 pb-4">
                        <div>
                          <h3 className="text-sm font-bold text-zinc-150">{activeBug.title}</h3>
                          <div className="flex gap-2.5 mt-2">
                            <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                              Project: <strong className="text-zinc-200">{activeBug.projectName}</strong>
                            </span>
                            <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                              Category: <strong className="text-zinc-200">{activeBug.category}</strong>
                            </span>
                            <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                              Severity: <strong className="text-zinc-200">{activeBug.severity}</strong>
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(activeBug.timestamp).toLocaleString()}
                        </span>
                      </div>

                      {/* Description */}
                      <div className="flex flex-col gap-1.5">
                        <h4 className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Reproduction Description</h4>
                        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap">
                          {activeBug.description}
                        </div>
                      </div>

                      {/* Console logs */}
                      {activeBug.consoleLogs && (
                        <div className="flex flex-col gap-1.5">
                          <h4 className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Intercepted Error Logs</h4>
                          <pre className="bg-red-950/5 border border-red-950/20 text-red-300 p-4 rounded text-[10px] font-mono overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {activeBug.consoleLogs}
                          </pre>
                        </div>
                      )}

                      {/* Attachments */}
                      {(activeBug.screenshotUrl || activeBug.videoUrl) && (
                        <div className="flex flex-col gap-2.5 mt-2">
                          <h4 className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Media Attachments</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Screenshot viewer */}
                            {activeBug.screenshotUrl && (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-zinc-500 font-semibold flex items-center gap-1">
                                  <span>📸 Screenshot Capture</span>
                                  <a href={activeBug.screenshotUrl} target="_blank" rel="noreferrer" className="text-blue-450 hover:underline">
                                    <ExternalLink className="w-2.5 h-2.5 inline" />
                                  </a>
                                </span>
                                <div className="border border-zinc-900 rounded overflow-hidden bg-black">
                                  <img
                                    src={activeBug.screenshotUrl}
                                    alt="Bug screenshot"
                                    className="w-full h-auto object-contain max-h-60 hover:scale-102 transition-transform cursor-zoom-in"
                                    onClick={() => window.open(activeBug.screenshotUrl!, "_blank")}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Video clip player */}
                            {activeBug.videoUrl && (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] text-zinc-500 font-semibold flex items-center gap-1">
                                  <span>🎥 Video Recording Clip</span>
                                </span>
                                <div className="border border-zinc-900 rounded overflow-hidden bg-black aspect-video flex items-center justify-center">
                                  <video
                                    src={activeBug.videoUrl}
                                    controls
                                    className="w-full h-full object-contain max-h-60"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-550 text-xs">
                      <AlertCircle className="w-6 h-6 text-zinc-600" />
                      <span>Select a bug report from the list to view telemetry details.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Project Modal Overlay */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 px-5 py-4">
              <h3 className="text-sm font-semibold text-zinc-100">Register WebGL Game</h3>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddProject} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-zinc-550 uppercase tracking-wider">Project Name Identifier</label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g. bits_exp_1"
                  className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-150 placeholder-zinc-650 focus:outline-none focus:border-zinc-700 font-medium"
                />
                <span className="text-[10px] text-zinc-500">
                  This identifier must match the `projectName` configured in your Unity index.html configuration block.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-zinc-550 uppercase tracking-wider">Description</label>
                <textarea
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Bouncing bricks simulation..."
                  className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-150 placeholder-zinc-650 focus:outline-none focus:border-zinc-700 resize-none min-h-[60px]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="bg-zinc-950 border border-zinc-850 hover:bg-zinc-900 text-zinc-350 text-xs font-semibold px-4 py-2 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2 rounded-md transition-colors shadow"
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
