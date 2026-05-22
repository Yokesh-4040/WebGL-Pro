import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import ftplib
import io
import json
import os
import threading
import webbrowser
from datetime import datetime

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

DEFAULT_CONFIG = {
    "ftp_host": "",
    "ftp_user": "",
    "ftp_pass": "",
    "ftp_domain": "",
    "base_dir": "public_html",
    "inject_mode": "none",
    "upload_mode": "full",
    "upload_htaccess": True,
    "projects": {}
}


def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
            for k, v in DEFAULT_CONFIG.items():
                data.setdefault(k, v)
            # Migrate legacy boolean to string
            if "inject_archive_menu" in data and "inject_mode" not in data:
                data["inject_mode"] = "inject" if data["inject_archive_menu"] else "none"
            return data
    return dict(DEFAULT_CONFIG)


def save_config(cfg):
    # Never persist the legacy key
    out = {k: v for k, v in cfg.items() if k != "inject_archive_menu"}
    with open(CONFIG_FILE, "w") as f:
        json.dump(out, f, indent=2)


def fmt_size(n):
    if n < 1024:
        return f"{n} B"
    elif n < 1024 ** 2:
        return f"{n/1024:.1f} KB"
    else:
        return f"{n/1024**2:.2f} MB"


def abs_path(path):
    return "/" + path.lstrip("/")


def ftp_dir_exists(ftp, path):
    try:
        ftp.cwd(abs_path(path))
        ftp.cwd("/")
        return True
    except ftplib.error_perm:
        ftp.cwd("/")
        return False


def ftp_makedirs(ftp, path):
    parts = abs_path(path).lstrip("/").split("/")
    current = ""
    for part in parts:
        current = f"{current}/{part}"
        try:
            ftp.mkd(current)
        except ftplib.error_perm:
            pass
    ftp.cwd("/")


def ftp_list_archives(ftp, archive_dir, project):
    """Return sorted list of archive folder names (newest first) for a project."""
    prefix = f"{project}_"
    raw = []
    try:
        raw = ftp.nlst(archive_dir)
    except ftplib.error_perm:
        pass

    def _name(e):
        return os.path.basename(e.strip().rstrip("/"))

    return sorted(
        [_name(e) for e in raw if _name(e).startswith(prefix)],
        reverse=True
    )


def archive_url(arc_name, base, domain):
    """Build the public URL for an archive folder."""
    raw = f"{base}/archive/{arc_name}/"
    for pfx in ("public_html/", "public_html"):
        if raw.startswith(pfx):
            raw = raw[len(pfx):]
    return f"https://{domain}/{raw}"


def build_versions_json(archives, project, base, domain, live_url):
    """Return a JSON-serialisable dict describing the live build and all archives."""
    prefix = f"{project}_"
    arc_list = []
    for arc in archives:
        ts_part = arc[len(prefix):]
        try:
            dt    = datetime.strptime(ts_part, "%Y%m%d_%H%M%S")
            label = dt.strftime("%d %b %Y  %H:%M")
        except ValueError:
            label = ts_part
        arc_list.append({"label": label, "url": archive_url(arc, base, domain)})
    return {"live_url": live_url, "archives": arc_list}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Unity WebGL Uploader")
        self.resizable(False, False)
        self.config_data = load_config()
        self._last_upload_url = ""
        self._cancel_flag = threading.Event()
        self._build_ui()
        self._refresh_projects()

    # ── UI ────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=10, pady=10)

        self.tab_upload   = ttk.Frame(nb, padding=10)
        self.tab_settings = ttk.Frame(nb, padding=10)
        nb.add(self.tab_upload,   text="  Upload  ")
        nb.add(self.tab_settings, text="  FTP Settings  ")

        self._build_upload_tab()
        self._build_settings_tab()

    # ── Upload tab ────────────────────────────────────────────────────────────

    def _build_upload_tab(self):
        f = self.tab_upload

        # Project selector
        top = ttk.LabelFrame(f, text="Project", padding=8)
        top.pack(fill="x", pady=(0, 8))

        self.project_var   = tk.StringVar()
        self.project_combo = ttk.Combobox(top, textvariable=self.project_var,
                                           state="readonly", width=30)
        self.project_combo.pack(side="left", padx=(0, 6))
        ttk.Button(top, text="New Project", command=self._new_project).pack(side="left", padx=(0, 4))
        ttk.Button(top, text="Delete",      command=self._delete_project).pack(side="left", padx=(0, 4))
        ttk.Button(top, text="🗂 Archives", command=self._show_archives).pack(side="left")

        # Build folder
        mid = ttk.LabelFrame(f, text="Unity WebGL Build Folder", padding=8)
        mid.pack(fill="x", pady=(0, 8))

        self.folder_var = tk.StringVar()
        ttk.Entry(mid, textvariable=self.folder_var, width=40, state="readonly").pack(side="left", padx=(0, 6))
        ttk.Button(mid, text="Browse…", command=self._browse_folder).pack(side="left")

        # Remote path preview
        preview = ttk.Frame(f)
        preview.pack(fill="x", pady=(0, 6))
        ttk.Label(preview, text="Remote path:").pack(side="left")
        self.remote_label = ttk.Label(preview, text="—", foreground="#555")
        self.remote_label.pack(side="left", padx=6)

        # Upload Mode
        mode_frame = ttk.LabelFrame(f, text="Upload Mode", padding=(8, 6))
        mode_frame.pack(fill="x", pady=(0, 6))

        self.upload_mode_var = tk.StringVar(value=self.config_data.get("upload_mode", "full"))
        self.upload_mode_var.trace_add("write", lambda *_: self._on_mode_change())

        modes = [
            ("full",     "🔄 Full Upload",
             "Archive old build, upload everything (index.html + TemplateData + Build/)"),
            ("template", "📄 Template Only",
             "Overwrite index.html & TemplateData/ only  —  fast, keeps live build data"),
            ("data",     "📦 Data Only",
             "Overwrite Build/ files only  —  skips template, no archiving"),
        ]
        for val, label, tip in modes:
            row = ttk.Frame(mode_frame)
            row.pack(fill="x", pady=1)
            ttk.Radiobutton(row, text=label, variable=self.upload_mode_var,
                            value=val).pack(side="left")
            ttk.Label(row, text=tip, foreground="#777",
                      font=("Helvetica", 10)).pack(side="left", padx=(6, 0))

        # index.html inject options
        idx_frame = ttk.LabelFrame(f, text="index.html  (after upload)", padding=(8, 6))
        idx_frame.pack(fill="x", pady=(0, 6))

        self.inject_mode_var = tk.StringVar(value=self.config_data.get("inject_mode", "none"))
        self.inject_mode_var.trace_add("write", lambda *_: self._save_inject_pref())

        ttk.Radiobutton(idx_frame, text="Use default  (no changes to index.html)",
                        variable=self.inject_mode_var, value="none").pack(anchor="w")
        ttk.Radiobutton(idx_frame,
                        text="Inject floating version menu  (highlights current vs archive in-browser)",
                        variable=self.inject_mode_var, value="inject").pack(anchor="w")

        # Keep inject_menu_var in sync for code that checks it
        self.inject_menu_var = tk.BooleanVar(
            value=self.config_data.get("inject_mode", "none") == "inject")
        self.inject_mode_var.trace_add(
            "write",
            lambda *_: self.inject_menu_var.set(self.inject_mode_var.get() == "inject"))

        # .htaccess gzip option
        gz_row = ttk.Frame(f)
        gz_row.pack(fill="x", pady=(0, 6))
        self.htaccess_var = tk.BooleanVar(value=self.config_data.get("upload_htaccess", True))
        self.htaccess_var.trace_add("write", lambda *_: self._save_htaccess_pref())
        ttk.Checkbutton(
            gz_row,
            text="Auto-upload .htaccess to fix gzip compressed build errors (recommended)",
            variable=self.htaccess_var
        ).pack(side="left")

        self.project_var.trace_add("write", lambda *_: self._update_remote_label())
        self.project_combo.bind("<<ComboboxSelected>>", lambda _: self._load_project_folder())

        # Progress
        prog_frame = ttk.LabelFrame(f, text="Progress", padding=8)
        prog_frame.pack(fill="x", pady=(0, 8))

        self.progress  = ttk.Progressbar(prog_frame, mode="determinate", length=460)
        self.progress.pack(fill="x", pady=(0, 4))

        self.status_var = tk.StringVar(value="Ready.")
        ttk.Label(prog_frame, textvariable=self.status_var, anchor="w").pack(fill="x")

        self.bytes_var   = tk.StringVar(value="")
        self.bytes_label = ttk.Label(prog_frame, textvariable=self.bytes_var,
                                     foreground="#555", anchor="w", font=("Menlo", 10))
        self.bytes_label.pack(fill="x")

        # Log
        log_frame = ttk.LabelFrame(f, text="Log", padding=8)
        log_frame.pack(fill="both", expand=True, pady=(0, 8))

        self.log = tk.Text(log_frame, height=10, state="disabled",
                           font=("Menlo", 11), bg="#1e1e1e", fg="#d4d4d4",
                           relief="flat", wrap="none")
        sb = ttk.Scrollbar(log_frame, command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        self.log.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        # Bottom row
        bottom = ttk.Frame(f)
        bottom.pack(fill="x", pady=(0, 0))

        self.upload_btn = ttk.Button(bottom, text="Upload to Hostinger",
                                     command=self._start_upload)
        self.upload_btn.pack(side="left", fill="x", expand=True, ipady=6)

        self.cancel_btn = ttk.Button(bottom, text="Cancel",
                                     command=self._cancel_upload, state="disabled")
        self.cancel_btn.pack(side="left", padx=(6, 0), ipady=6)

        self.copy_btn = ttk.Button(bottom, text="Copy Link",
                                   command=self._copy_link, state="disabled")
        self.copy_btn.pack(side="left", padx=(6, 0), ipady=6)

    # ── Settings tab ─────────────────────────────────────────────────────────

    def _build_settings_tab(self):
        f = self.tab_settings

        fields = [
            ("FTP Host",       "ftp_host",   False),
            ("FTP Username",   "ftp_user",   False),
            ("FTP Password",   "ftp_pass",   True),
            ("Site Domain",    "ftp_domain", False),
            ("Base Directory", "base_dir",   False),
        ]

        self._setting_vars = {}
        for label, key, secret in fields:
            row = ttk.Frame(f)
            row.pack(fill="x", pady=4)
            ttk.Label(row, text=label, width=16, anchor="w").pack(side="left")
            var  = tk.StringVar(value=self.config_data.get(key, ""))
            show = "*" if secret else ""
            ent  = ttk.Entry(row, textvariable=var, show=show, width=36)
            ent.pack(side="left")
            if key == "ftp_domain":
                ttk.Label(row, text="  e.g. yourdomain.com", foreground="#888").pack(side="left")
            self._setting_vars[key] = var

        btn_row = ttk.Frame(f)
        btn_row.pack(pady=12)
        ttk.Button(btn_row, text="Save Settings",    command=self._save_settings).pack(side="left", padx=(0, 8))
        self.test_btn = ttk.Button(btn_row, text="Test Connection", command=self._test_connection)
        self.test_btn.pack(side="left")

        self.settings_status = ttk.Label(f, text="", foreground="green")
        self.settings_status.pack()

    # ── Project management ────────────────────────────────────────────────────

    def _refresh_projects(self):
        names = list(self.config_data["projects"].keys())
        self.project_combo["values"] = names
        if names and not self.project_var.get():
            self.project_var.set(names[0])
            self._load_project_folder()
        self._update_remote_label()

    def _new_project(self):
        win = tk.Toplevel(self)
        win.title("New Project")
        win.resizable(False, False)
        win.grab_set()

        ttk.Label(win, text="Project name:").pack(padx=20, pady=(16, 4))
        name_var = tk.StringVar()
        entry    = ttk.Entry(win, textvariable=name_var, width=28)
        entry.pack(padx=20)
        entry.focus()

        def create():
            name = name_var.get().strip()
            if not name:
                messagebox.showwarning("Name required", "Enter a project name.", parent=win)
                return
            if name in self.config_data["projects"]:
                messagebox.showwarning("Duplicate", "A project with that name already exists.", parent=win)
                return
            self.config_data["projects"][name] = {"build_folder": ""}
            save_config(self.config_data)
            win.destroy()
            self._refresh_projects()
            self.project_var.set(name)
            self._update_remote_label()

        ttk.Button(win, text="Create", command=create).pack(pady=12)
        win.bind("<Return>", lambda _: create())

    def _delete_project(self):
        name = self.project_var.get()
        if not name:
            return
        if not messagebox.askyesno("Delete", f"Delete project '{name}'?"):
            return
        self.config_data["projects"].pop(name, None)
        save_config(self.config_data)
        self.project_var.set("")
        self.folder_var.set("")
        self._refresh_projects()

    def _load_project_folder(self):
        name = self.project_var.get()
        if name and name in self.config_data["projects"]:
            self.folder_var.set(self.config_data["projects"][name].get("build_folder", ""))
        self._update_remote_label()

    def _update_remote_label(self):
        name = self.project_var.get()
        if name:
            base = self.config_data.get("base_dir", "public_html").rstrip("/")
            self.remote_label.config(text=f"{base}/{name}/")
        else:
            self.remote_label.config(text="—")

    # ── Settings ──────────────────────────────────────────────────────────────

    def _on_mode_change(self):
        self.config_data["upload_mode"] = self.upload_mode_var.get()
        save_config(self.config_data)

    def _save_inject_pref(self):
        self.config_data["inject_mode"] = self.inject_mode_var.get()
        save_config(self.config_data)

    def _save_htaccess_pref(self):
        self.config_data["upload_htaccess"] = self.htaccess_var.get()
        save_config(self.config_data)

    def _save_settings(self):
        for key, var in self._setting_vars.items():
            self.config_data[key] = var.get().strip()
        save_config(self.config_data)
        self._update_remote_label()
        self.settings_status.config(text="Saved!", foreground="green")
        self.after(2000, lambda: self.settings_status.config(text=""))

    # ── Test connection ───────────────────────────────────────────────────────

    def _test_connection(self):
        host = self._setting_vars["ftp_host"].get().strip()
        user = self._setting_vars["ftp_user"].get().strip()
        pwd  = self._setting_vars["ftp_pass"].get().strip()

        if not host or not user or not pwd:
            messagebox.showwarning("Missing fields", "Fill in Host, Username and Password first.")
            return

        self.test_btn.config(state="disabled")
        self.settings_status.config(text="Testing…", foreground="#888")
        threading.Thread(target=self._test_thread, args=(host, user, pwd), daemon=True).start()

    def _test_thread(self, host, user, pwd):
        try:
            ftp = ftplib.FTP()
            ftp.connect(host, 21, timeout=10)
            ftp.login(user, pwd)
            welcome = ftp.getwelcome()
            ftp.quit()
            msg = f"Connected!  {welcome[:60]}" if welcome else "Connected successfully!"
            self.after(0, self._test_result, True, msg)
        except ftplib.error_perm as e:
            self.after(0, self._test_result, False, f"Auth failed: {e}")
        except OSError as e:
            self.after(0, self._test_result, False, f"Cannot reach host: {e}")
        except Exception as e:
            self.after(0, self._test_result, False, str(e))

    def _test_result(self, ok, msg):
        self.test_btn.config(state="normal")
        color = "green" if ok else "red"
        self.settings_status.config(text=msg, foreground=color)
        if not ok:
            messagebox.showerror("Connection Failed", msg)

    # ── Archives ──────────────────────────────────────────────────────────────

    def _show_archives(self):
        project = self.project_var.get()
        if not project:
            messagebox.showwarning("No project", "Select a project first.")
            return
        cfg = self.config_data
        if not cfg["ftp_host"] or not cfg["ftp_user"] or not cfg["ftp_pass"]:
            messagebox.showwarning("No credentials", "Fill in FTP credentials in Settings first.")
            return

        win = tk.Toplevel(self)
        win.title(f"Archives — {project}")
        win.geometry("560x400")
        win.resizable(True, True)
        win.grab_set()

        ttk.Label(win, text=f"Archives for:  {project}",
                  font=("SF Pro", 13, "bold")).pack(pady=(14, 4), padx=16, anchor="w")

        base        = cfg["base_dir"].rstrip("/")
        archive_dir = abs_path(f"{base}/archive")
        ttk.Label(win, text=f"Remote path:  {archive_dir}/{project}_*",
                  foreground="#666").pack(padx=16, anchor="w")

        frame = ttk.Frame(win, padding=(16, 8))
        frame.pack(fill="both", expand=True)

        cols = ("folder", "date", "time")
        tree = ttk.Treeview(frame, columns=cols, show="headings", selectmode="browse")
        tree.heading("folder", text="Archive Folder")
        tree.heading("date",   text="Date")
        tree.heading("time",   text="Time")
        tree.column("folder", width=280)
        tree.column("date",   width=100, anchor="center")
        tree.column("time",   width=80,  anchor="center")

        sb = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=sb.set)
        tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        status_var = tk.StringVar(value="Fetching archives…")
        ttk.Label(win, textvariable=status_var, foreground="#555").pack(pady=(0, 6))

        btn_row     = ttk.Frame(win)
        btn_row.pack(pady=(0, 14))
        restore_btn = ttk.Button(btn_row, text="⬆ Restore Selected",
                                 command=lambda: self._run_restore(win, tree, project, status_var),
                                 state="disabled")
        restore_btn.pack(side="left", padx=(0, 8))

        copy_arc_lbl = tk.StringVar(value="Copy Archive Link")
        copy_arc_btn = ttk.Button(btn_row, textvariable=copy_arc_lbl, state="disabled",
                                  command=lambda: self._copy_archive_link(
                                      tree, project, base, cfg, copy_arc_lbl, win))
        copy_arc_btn.pack(side="left", padx=(0, 8))
        ttk.Button(btn_row, text="Close", command=win.destroy).pack(side="left")

        def _on_arc_select(_):
            has_sel = bool(tree.selection())
            restore_btn.config(state="normal" if has_sel else "disabled")
            copy_arc_btn.config(state="normal" if has_sel else "disabled")

        tree.bind("<<TreeviewSelect>>", _on_arc_select)

        threading.Thread(
            target=self._fetch_archives_thread,
            args=(project, archive_dir, tree, status_var, win),
            daemon=True
        ).start()

    def _fetch_archives_thread(self, project, archive_dir, tree, status_var, win):
        cfg = self.config_data
        try:
            ftp = ftplib.FTP()
            ftp.connect(cfg["ftp_host"], 21, timeout=15)
            ftp.login(cfg["ftp_user"], cfg["ftp_pass"])
            ftp.set_pasv(True)
            ftp.cwd("/")

            matches = ftp_list_archives(ftp, archive_dir, project)
            ftp.quit()

            def populate():
                for item in tree.get_children():
                    tree.delete(item)
                if not matches:
                    status_var.set("No archives found for this project.")
                    return
                for name in matches:
                    ts_part = name[len(f"{project}_"):]
                    try:
                        dt       = datetime.strptime(ts_part, "%Y%m%d_%H%M%S")
                        date_str = dt.strftime("%d %b %Y")
                        time_str = dt.strftime("%H:%M:%S")
                    except ValueError:
                        date_str = ts_part
                        time_str = ""
                    tree.insert("", "end", iid=name, values=(name, date_str, time_str))
                status_var.set(f"{len(matches)} archive(s) found.")

            win.after(0, populate)

        except Exception as e:
            win.after(0, status_var.set, f"Error: {e}")

    # ── Unified restore ───────────────────────────────────────────────────────

    def _run_restore(self, win, tree, project, status_var):
        sel = tree.selection()
        if not sel:
            return
        archive_name = sel[0]
        if not messagebox.askyesno(
            "Restore Archive",
            f"Restore  '{archive_name}'  as the live build for '{project}'?\n\n"
            f"The current live build will be archived first.",
            parent=win
        ):
            return

        cfg         = self.config_data
        base        = cfg["base_dir"].rstrip("/")
        remote_root = abs_path(f"{base}/{project}")
        archive_dir = abs_path(f"{base}/archive")
        restore_src = f"{archive_dir}/{archive_name}"

        status_var.set("Restoring…")

        def do_restore():
            try:
                ftp = ftplib.FTP()
                ftp.connect(cfg["ftp_host"], 21, timeout=30)
                ftp.login(cfg["ftp_user"], cfg["ftp_pass"])
                ftp.set_pasv(True)
                ftp.cwd("/")

                if ftp_dir_exists(ftp, remote_root):
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    ftp_makedirs(ftp, archive_dir)
                    ftp.rename(remote_root, f"{archive_dir}/{project}_{ts}")

                ftp.rename(restore_src, remote_root)
                ftp.quit()

                win.after(0, status_var.set, f"Restored '{archive_name}' successfully!")
                win.after(0, messagebox.showinfo, "Restored",
                          f"'{archive_name}' is now the live build for '{project}'.")
                win.after(500, lambda: self._fetch_archives_thread(
                    project, archive_dir, tree, status_var, win))

            except Exception as e:
                win.after(0, status_var.set, f"Restore failed: {e}")
                win.after(0, messagebox.showerror, "Restore Failed", str(e))

        threading.Thread(target=do_restore, daemon=True).start()

    # ── Browse ────────────────────────────────────────────────────────────────

    def _browse_folder(self):
        current = self.folder_var.get()
        initial = current if current and os.path.isdir(current) else os.path.expanduser("~")
        folder  = filedialog.askdirectory(title="Select Unity WebGL Build Folder",
                                          initialdir=initial)
        if folder:
            self.folder_var.set(folder)
            name = self.project_var.get()
            if name:
                self.config_data["projects"][name]["build_folder"] = folder
                save_config(self.config_data)

    # ── Copy link ─────────────────────────────────────────────────────────────

    def _copy_link(self):
        self.clipboard_clear()
        self.clipboard_append(self._last_upload_url)
        self.copy_btn.config(text="Copied!")
        self.after(2000, lambda: self.copy_btn.config(text="Copy Link"))

    # ── Upload ────────────────────────────────────────────────────────────────

    def _log(self, msg, color=None):
        tag = color or "default"
        self.log.configure(state="normal")
        self.log.insert("end", msg + "\n", tag)
        self.log.tag_config("archive", foreground="#f0a500")
        self.log.tag_config("success", foreground="#4ec94e")
        self.log.tag_config("default", foreground="#d4d4d4")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _cancel_upload(self):
        self._cancel_flag.set()
        self.cancel_btn.config(state="disabled", text="Cancelling…")
        self.status_var.set("Cancelling — will restore last version…")

    def _start_upload(self):
        if not self.project_var.get():
            messagebox.showwarning("No project", "Select or create a project first.")
            return
        folder = self.folder_var.get()
        if not folder or not os.path.isdir(folder):
            messagebox.showwarning("No folder", "Select a valid Unity WebGL build folder.")
            return

        cfg = self.config_data
        if not cfg["ftp_host"] or not cfg["ftp_user"] or not cfg["ftp_pass"]:
            messagebox.showwarning("No credentials", "Fill in FTP credentials in Settings.")
            return

        self._cancel_flag.clear()
        self.upload_btn.config(state="disabled")
        self.cancel_btn.config(state="normal", text="Cancel")
        self.copy_btn.config(state="disabled")
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")
        self.progress["value"] = 0
        self.bytes_var.set("")
        self._last_upload_url = ""

        threading.Thread(target=self._upload_thread, daemon=True).start()

    def _upload_thread(self):
        cfg         = self.config_data
        project     = self.project_var.get()
        folder      = self.folder_var.get()
        base        = cfg["base_dir"].rstrip("/")
        remote_root = f"{base}/{project}"
        mode        = self.upload_mode_var.get()

        def status(msg):      self.after(0, self.status_var.set, msg)
        def log(msg, c=None): self.after(0, self._log, msg, c)
        def set_prog(v):      self.after(0, self.progress.configure, {"value": v})
        def set_bytes(msg):   self.after(0, self.bytes_var.set, msg)
        def cancelled():      return self._cancel_flag.is_set()

        archived_path = None

        try:
            log(f"Connecting to {cfg['ftp_host']}…")
            status("Connecting…")
            ftp = ftplib.FTP()
            ftp.connect(cfg["ftp_host"], 21, timeout=30)
            ftp.login(cfg["ftp_user"], cfg["ftp_pass"])
            ftp.set_pasv(True)
            ftp.cwd("/")
            log(f"Connected.  CWD: {ftp.pwd()}")

            mode_labels = {"full": "Full Upload", "template": "Template Only", "data": "Data Only"}
            log(f"Upload mode: {mode_labels.get(mode, mode)}", "archive")

            # ── Archive existing folder (full mode only) ───────────────────────
            remote_root_abs = abs_path(remote_root)
            archive_dir     = abs_path(f"{base}/archive")

            if mode == "full" and ftp_dir_exists(ftp, remote_root_abs):
                ts            = datetime.now().strftime("%Y%m%d_%H%M%S")
                archived_path = f"{archive_dir}/{project}_{ts}"
                ftp_makedirs(ftp, archive_dir)
                log(f"Existing folder found — archiving to {archived_path}", "archive")
                status("Archiving old build…")
                ftp.rename(remote_root_abs, archived_path)
                log("Archived OK.", "archive")
            elif mode in ("template", "data"):
                log("Partial upload — skipping archive step.", "archive")

            # ── Collect and filter files ───────────────────────────────────────
            all_files = []
            for root, _, files in os.walk(folder):
                for fname in files:
                    fp   = os.path.join(root, fname)
                    size = os.path.getsize(fp)
                    all_files.append((fp, size))

            def _rel(fp):
                return os.path.relpath(fp, folder).replace(os.sep, "/")

            if mode == "template":
                all_files = [(fp, sz) for fp, sz in all_files
                             if not _rel(fp).startswith("Build/")]
                log("Template-only: excluding Build/ directory.", "archive")
            elif mode == "data":
                all_files = [(fp, sz) for fp, sz in all_files
                             if _rel(fp).startswith("Build/")]
                log("Data-only: uploading Build/ directory only.", "archive")

            total_bytes = sum(sz for _, sz in all_files)
            total_files = len(all_files)
            log(f"Found {total_files} files — {fmt_size(total_bytes)} total.")
            log(f"Uploading to: {remote_root_abs}")

            # ── Sanitise filenames: spaces → underscores ───────────────────────
            rename_map = {}
            for local_path, _ in all_files:
                rel_fwd   = _rel(local_path)
                sanitised = rel_fwd.replace(" ", "_")
                if sanitised != rel_fwd:
                    rename_map[rel_fwd] = sanitised

            if rename_map:
                log(f"Spaces found in {len(rename_map)} filename(s) — renaming to underscores:", "archive")
                for orig, fixed in rename_map.items():
                    log(f"  {orig.split('/')[-1]}  →  {fixed.split('/')[-1]}", "archive")

            # Pre-patch index.html in memory to reference sanitised filenames
            index_patch = {}
            if rename_map:
                idx_local = os.path.join(folder, "index.html")
                if os.path.exists(idx_local):
                    with open(idx_local, "rb") as _f:
                        src = _f.read().decode("utf-8", errors="replace")
                    for orig, fixed in rename_map.items():
                        src = src.replace(orig.split("/")[-1], fixed.split("/")[-1])
                    index_patch["index.html"] = src.encode("utf-8")
                    log("index.html pre-patched in memory (references updated).", "success")

            ftp_makedirs(ftp, remote_root_abs)
            log(f"Remote folder ready: {remote_root_abs}")

            uploaded_bytes = 0

            for i, (local_path, file_size) in enumerate(all_files, 1):
                rel_fwd     = _rel(local_path)
                remote_rel  = rename_map.get(rel_fwd, rel_fwd)
                remote_path = remote_root_abs + "/" + remote_rel
                remote_dir  = remote_path.rsplit("/", 1)[0]
                fname       = os.path.basename(remote_path)

                if cancelled():
                    raise InterruptedError("Upload cancelled by user.")

                ftp_makedirs(ftp, remote_dir)

                log(f"[{i}/{total_files}]  {rel_fwd}  ({fmt_size(file_size)})")
                status(f"Uploading {i}/{total_files}: {fname}")

                file_sent = [0]

                def make_callback(base_uploaded, this_file_size, name, idx):
                    def cb(block):
                        if cancelled():
                            raise InterruptedError("Upload cancelled by user.")
                        file_sent[0] += len(block)
                        current_total = base_uploaded + file_sent[0]
                        set_prog(int(current_total / total_bytes * 100))
                        set_bytes(
                            f"  File: {fmt_size(file_sent[0])} / {fmt_size(this_file_size)}"
                            f"     Total: {fmt_size(current_total)} / {fmt_size(total_bytes)}"
                        )
                        status(f"Uploading {idx}/{total_files}: {name}  "
                               f"({int(file_sent[0]/this_file_size*100) if this_file_size else 100}%)")
                    return cb

                cb = make_callback(uploaded_bytes, file_size, fname, i)

                if rel_fwd in index_patch:
                    patched_bytes = index_patch[rel_fwd]
                    ftp.storbinary(f"STOR {remote_path}", io.BytesIO(patched_bytes),
                                   blocksize=65536, callback=cb)
                    uploaded_bytes += len(patched_bytes)
                else:
                    with open(local_path, "rb") as f:
                        ftp.storbinary(f"STOR {remote_path}", f, blocksize=65536, callback=cb)
                    uploaded_bytes += file_size

                set_prog(int(uploaded_bytes / total_bytes * 100))
                set_bytes(f"  {fmt_size(uploaded_bytes)} / {fmt_size(total_bytes)}")

            # ── Upload .htaccess (full/data mode only) ────────────────────────
            if self.htaccess_var.get() and mode != "template":
                has_gz   = any(f.endswith(".gz")  for f, _ in all_files)
                has_br   = any(f.endswith(".br")  for f, _ in all_files)

                if has_gz:
                    comp_label = "Gzip Compressed"
                elif has_br:
                    comp_label = "Brotli Compressed"
                else:
                    comp_label = "Uncompressed"

                status(f"Uploading .htaccess ({comp_label} build)…")
                log(f"Detected build type: {comp_label}. Uploading matching .htaccess…")

                lines = [
                    f"# Unity WebGL Build Support - {comp_label}",
                    "# Auto-generated by Unity WebGL Uploader",
                    "",
                    "Options -Indexes",
                    "",
                    "<IfModule mod_mime.c>",
                    "",
                    "    # Uncompressed MIME types (all builds need these)",
                    "    AddType application/wasm         .wasm",
                    "    AddType application/octet-stream .data",
                    "    AddType application/javascript   .js",
                    "",
                ]

                if has_gz:
                    lines += [
                        "    # Gzip compressed files",
                        "    AddEncoding gzip .gz",
                        "",
                        '    <FilesMatch "\\.js\\.gz$">',
                        "        ForceType application/javascript",
                        '        Header set Content-Encoding gzip',
                        '        Header set Content-Type "application/javascript"',
                        "    </FilesMatch>",
                        "",
                        '    <FilesMatch "\\.wasm\\.gz$">',
                        "        ForceType application/wasm",
                        '        Header set Content-Encoding gzip',
                        '        Header set Content-Type "application/wasm"',
                        "    </FilesMatch>",
                        "",
                        '    <FilesMatch "\\.data\\.gz$">',
                        "        ForceType application/octet-stream",
                        '        Header set Content-Encoding gzip',
                        '        Header set Content-Type "application/octet-stream"',
                        "    </FilesMatch>",
                        "",
                        '    <FilesMatch "\\.symbols\\.json\\.gz$">',
                        "        ForceType application/octet-stream",
                        '        Header set Content-Encoding gzip',
                        '        Header set Content-Type "application/octet-stream"',
                        "    </FilesMatch>",
                        "",
                    ]

                if has_br:
                    lines += [
                        "    # Brotli compressed files",
                        '    <FilesMatch "\\.js\\.br$">',
                        "        ForceType application/javascript",
                        '        Header set Content-Encoding br',
                        '        Header set Content-Type "application/javascript"',
                        "    </FilesMatch>",
                        "",
                        '    <FilesMatch "\\.wasm\\.br$">',
                        "        ForceType application/wasm",
                        '        Header set Content-Encoding br',
                        '        Header set Content-Type "application/wasm"',
                        "    </FilesMatch>",
                        "",
                        '    <FilesMatch "\\.data\\.br$">',
                        "        ForceType application/octet-stream",
                        '        Header set Content-Encoding br',
                        '        Header set Content-Type "application/octet-stream"',
                        "    </FilesMatch>",
                        "",
                    ]

                lines += [
                    "</IfModule>",
                    "",
                    "# Allow cross-origin requests (required for Unity asset loading)",
                    "<IfModule mod_headers.c>",
                    '    Header set Access-Control-Allow-Origin "*"',
                    "</IfModule>",
                    "",
                    "# NOTE: Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy",
                    "# are intentionally omitted. They are only needed for Unity builds",
                    "# with multithreading enabled and break standard builds.",
                ]

                htaccess_content = "\n".join(lines).encode("utf-8")
                ftp.storbinary(f"STOR {remote_root_abs}/.htaccess", io.BytesIO(htaccess_content))
                log(".htaccess uploaded.", "success")

            # ── Build live URL ─────────────────────────────────────────────────
            domain = cfg.get("ftp_domain", "").strip().rstrip("/")
            if domain:
                url_path = remote_root
                for prefix in ("public_html/", "public_html"):
                    if url_path.startswith(prefix):
                        url_path = url_path[len(prefix):]
                self._last_upload_url = f"https://{domain}/{url_path}/"
            else:
                self._last_upload_url = ""

            # ── Upload versions.json + inject fetch-based menu ─────────────────
            # versions.json is uploaded to the live project folder and fetched at
            # runtime by every page (live and archives alike) so the archive list
            # is always current without re-injecting archived index.html files.
            if self.inject_menu_var.get() and domain:
                status("Updating version menu…")
                log("Building version menu…")

                try:
                    ftp.cwd("/")
                    live_url     = self._last_upload_url
                    versions_url = live_url + "versions.json"

                    # ── 1. Upload versions.json ────────────────────────────────
                    archives    = ftp_list_archives(ftp, archive_dir, project)
                    ver_data    = build_versions_json(archives, project, base, domain, live_url)
                    ver_bytes   = json.dumps(ver_data, indent=2).encode("utf-8")
                    ftp.storbinary(
                        f"STOR {remote_root_abs}/versions.json",
                        io.BytesIO(ver_bytes)
                    )
                    log(f"versions.json uploaded ({len(archives)} archive(s)).", "archive")

                    # ── 2. Build the injected snippet ──────────────────────────
                    # The snippet is intentionally small — all rendering logic is
                    # inline JS that fetches versions.json at page-load time.
                    # This means archive index.html files also pick up the current
                    # list automatically (they all point to the same versions.json).
                    menu_html = (
                        "<!-- Unity WebGL Uploader: version menu -->\n"
                        "<script>\n"
                        "(function(){\n"
                        f"  var LIVE='{live_url}';\n"
                        f"  var VER='{versions_url}';\n"
                        "  var S=document.createElement('style');\n"
                        "  S.textContent=[\n"
                        "    '#_vb{position:fixed;bottom:18px;right:18px;z-index:9999;"
                            "font-family:system-ui,sans-serif}',\n"
                        "    '#_vb_btn{background:#1a1a2e;color:#e0e0e0;border:none;"
                            "padding:8px 16px;border-radius:22px;cursor:pointer;font-size:13px;"
                            "font-weight:500;box-shadow:0 2px 10px rgba(0,0,0,.45);"
                            "letter-spacing:.2px;display:flex;align-items:center;gap:6px}',\n"
                        "    '#_vb_btn:hover{background:#22223e}',\n"
                        "    '#_vb_panel{display:none;position:absolute;bottom:46px;right:0;"
                            "background:#12122a;border-radius:12px;min-width:270px;"
                            "box-shadow:0 6px 28px rgba(0,0,0,.55);overflow:hidden;"
                            "border:1px solid rgba(255,255,255,.07)}',\n"
                        "    '#_vb_panel.open{display:block}',\n"
                        "    '._vb_hd{padding:9px 14px;font-size:10px;color:#666;"
                            "text-transform:uppercase;letter-spacing:1.2px;"
                            "border-bottom:1px solid rgba(255,255,255,.06)}',\n"
                        "    '._vb_row{display:flex;align-items:center;padding:10px 14px;"
                            "color:#ccc;text-decoration:none;font-size:13px;"
                            "border-bottom:1px solid rgba(255,255,255,.05);transition:background .12s;"
                            "gap:8px}',\n"
                        "    '._vb_row:last-child{border-bottom:none}',\n"
                        "    '._vb_row:hover{background:rgba(255,255,255,.05)}',\n"
                        "    '._vb_live{color:#4ec94e;font-weight:600}',\n"
                        "    '._vb_here{font-weight:700;cursor:default;pointer-events:none;"
                            "opacity:.9}',\n"
                        "    '#_vb_badge{display:none;position:fixed;bottom:60px;right:18px;"
                            "z-index:9998;background:#2a1500;color:#f0a500;"
                            "border:1px solid rgba(240,165,0,.4);padding:5px 13px;"
                            "border-radius:20px;font-size:11px;font-family:system-ui,sans-serif;"
                            "box-shadow:0 2px 8px rgba(0,0,0,.4)}'\n"
                        "  ].join('');\n"
                        "  document.head.appendChild(S);\n"
                        "\n"
                        "  var wrap=document.createElement('div');wrap.id='_vb';\n"
                        "  wrap.innerHTML='<div id=\"_vb_badge\"></div>"
                            "<div id=\"_vb_panel\"><div class=\"_vb_hd\">Build Versions</div></div>"
                            "<button id=\"_vb_btn\">&#128230; Versions &#9662;</button>';\n"
                        "  document.body.appendChild(wrap);\n"
                        "\n"
                        "  var btn=document.getElementById('_vb_btn');\n"
                        "  var panel=document.getElementById('_vb_panel');\n"
                        "  var badge=document.getElementById('_vb_badge');\n"
                        "  btn.onclick=function(e){"
                            "panel.classList.toggle('open');e.stopPropagation();};\n"
                        "  document.addEventListener('click',function(){"
                            "panel.classList.remove('open');});\n"
                        "\n"
                        "  function norm(u){return u.replace(/[?#].*$/,'').replace(/\\/+$/,'')+'/'}\n"
                        "  var here=norm(location.href);\n"
                        "\n"
                        "  function render(data){\n"
                        "    var arcs=data.archives||[];\n"
                        "    var isLive=(here===norm(data.live_url||LIVE));\n"
                        "    var curArc=null;\n"
                        "    arcs.forEach(function(a){if(here===norm(a.url))curArc=a;});\n"
                        "\n"
                        "    /* button state */\n"
                        "    if(isLive){\n"
                        "      btn.innerHTML='&#9654; Live'+(arcs.length?"
                            "' <span style=\"opacity:.6;font-size:11px\">('+arcs.length+')</span>':'');\n"
                        "      btn.style.cssText+=';background:#0d2e1a;color:#4ec94e';\n"
                        "    }else if(curArc){\n"
                        "      btn.innerHTML='&#128230; Archive';\n"
                        "      btn.style.cssText+=';background:#2a1500;color:#f0a500';\n"
                        "      badge.style.display='block';\n"
                        "      badge.textContent='Viewing archive · '+curArc.label;\n"
                        "    }\n"
                        "\n"
                        "    /* live row */\n"
                        "    var liveA=document.createElement('a');\n"
                        "    liveA.href=isLive?'#':data.live_url||LIVE;\n"
                        "    liveA.className='_vb_row _vb_live'+(isLive?' _vb_here':'');\n"
                        "    if(isLive)liveA.style.background='rgba(14,46,26,.6)';\n"
                        "    liveA.innerHTML='&#9654; Current (Live)'+(isLive?"
                            "' <span style=\"font-size:11px;opacity:.7\">◄ here</span>':'');\n"
                        "    panel.appendChild(liveA);\n"
                        "\n"
                        "    /* archive rows */\n"
                        "    arcs.forEach(function(a){\n"
                        "      var el=document.createElement('a');\n"
                        "      var isThis=(here===norm(a.url));\n"
                        "      el.href=isThis?'#':a.url;\n"
                        "      el.className='_vb_row'+(isThis?' _vb_here':'');\n"
                        "      if(isThis)el.style.cssText='background:rgba(42,21,0,.6);color:#f0a500';\n"
                        "      el.innerHTML='&#128230; '+a.label+(isThis?"
                            "' <span style=\"font-size:11px;opacity:.7\">◄ here</span>':'');\n"
                        "      panel.appendChild(el);\n"
                        "    });\n"
                        "\n"
                        "    if(!arcs.length){\n"
                        "      var empty=document.createElement('div');\n"
                        "      empty.className='_vb_row';\n"
                        "      empty.style.color='#555';\n"
                        "      empty.textContent='No archives yet';\n"
                        "      panel.appendChild(empty);\n"
                        "    }\n"
                        "  }\n"
                        "\n"
                        "  fetch(VER+'?t='+Date.now())\n"
                        "    .then(function(r){return r.ok?r.json():Promise.reject(r.status);})\n"
                        "    .then(render)\n"
                        "    .catch(function(){render({live_url:LIVE,archives:[]});});\n"
                        "})();\n"
                        "</script>\n"
                        "<!-- end Unity WebGL Uploader -->"
                    )

                    # ── 3. Patch index.html ────────────────────────────────────
                    index_remote = remote_root_abs + "/index.html"
                    buf  = io.BytesIO()
                    ftp.retrbinary(f"RETR {index_remote}", buf.write)
                    html = buf.getvalue().decode("utf-8", errors="replace")

                    start_tag = "<!-- Unity WebGL Uploader: version menu -->"
                    end_tag   = "<!-- end Unity WebGL Uploader -->"
                    if start_tag in html:
                        s    = html.index(start_tag)
                        e    = html.index(end_tag) + len(end_tag)
                        html = html[:s] + html[e:]

                    if "</body>" in html:
                        html = html.replace("</body>", menu_html + "\n</body>", 1)
                    else:
                        html += "\n" + menu_html

                    ftp.storbinary(f"STOR {index_remote}", io.BytesIO(html.encode("utf-8")))
                    log(f"Version menu injected into index.html.", "success")

                except Exception as ie:
                    log(f"Warning: could not update version menu — {ie}")

            ftp.quit()

            status("Upload complete!")
            set_bytes("")
            log(f"\nAll files uploaded successfully.  ({fmt_size(total_bytes)})", "success")
            if self._last_upload_url:
                log(f"URL: {self._last_upload_url}", "success")

            final_url = self._last_upload_url
            self.after(0, self.copy_btn.config, {"state": "normal" if final_url else "disabled"})
            self.after(0, self._show_upload_success, project, remote_root_abs, final_url)

        except InterruptedError:
            log("\nUpload cancelled.", "archive")
            status("Restoring last version…" if archived_path else "Cancelled.")
            if archived_path:
                try:
                    log(f"Restoring {archived_path} → {remote_root_abs}…", "archive")
                    if ftp_dir_exists(ftp, remote_root_abs):
                        trash = f"{archive_dir}/_cancelled_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                        ftp.rename(remote_root_abs, trash)
                    ftp.rename(archived_path, remote_root_abs)
                    ftp.quit()
                    log("Last version restored successfully.", "success")
                    status("Cancelled — last version restored.")
                    self.after(0, messagebox.showinfo, "Cancelled",
                               "Upload cancelled.\nThe previous live build has been restored.")
                except Exception as re:
                    log(f"Restore failed: {re}")
                    status("Cancelled — restore failed, check manually.")
                    self.after(0, messagebox.showerror, "Restore Failed",
                               f"Upload cancelled but restore failed:\n{re}")
            else:
                try:
                    ftp.quit()
                except Exception:
                    pass
                log("Nothing to restore — no previous build existed.", "archive")
                status("Cancelled.")
                self.after(0, messagebox.showinfo, "Cancelled", "Upload cancelled.")

        except Exception as e:
            log(f"\nERROR: {e}")
            status("Upload failed.")
            self.after(0, messagebox.showerror, "Upload Failed", str(e))

        finally:
            self.after(0, self.upload_btn.config, {"state": "normal"})
            self.after(0, self.cancel_btn.config, {"state": "disabled", "text": "Cancel"})

    # ── Archive link helper ────────────────────────────────────────────────────

    def _copy_archive_link(self, tree, project, base, cfg, label_var, win):
        sel = tree.selection()
        if not sel:
            return
        archive_name = sel[0]
        domain = cfg.get("ftp_domain", "").strip().rstrip("/")
        if not domain:
            messagebox.showwarning("No domain", "Set a Site Domain in Settings first.", parent=win)
            return
        arc_raw = f"{base}/archive/{archive_name}/"
        for pfx in ("public_html/", "public_html"):
            if arc_raw.startswith(pfx):
                arc_raw = arc_raw[len(pfx):]
        url = f"https://{domain}/{arc_raw}"
        self.clipboard_clear()
        self.clipboard_append(url)
        label_var.set("Copied!")
        win.after(2000, lambda: label_var.set("Copy Archive Link"))

    # ── Upload success overlay ─────────────────────────────────────────────────

    def _show_upload_success(self, project, remote_root_abs, live_url=""):
        cfg         = self.config_data
        base        = cfg["base_dir"].rstrip("/")
        archive_dir = abs_path(f"{base}/archive")
        url         = (live_url or "").strip()
        upload_ts   = datetime.now().strftime("%d %b %Y  %H:%M:%S")

        win = tk.Toplevel(self)
        win.title("Upload Complete")
        win.geometry("640x540")
        win.resizable(True, True)
        win.grab_set()

        hdr = tk.Frame(win, bg="#1a7f4b")
        hdr.pack(fill="x")
        tk.Label(hdr, text="  Upload Complete",
                 bg="#1a7f4b", fg="white",
                 font=("Helvetica", 14, "bold")).pack(pady=12, padx=16, anchor="w")
        tk.Label(hdr, text=f"Project: {project}    Remote: {remote_root_abs}",
                 bg="#1a7f4b", fg="#c8f0d8",
                 font=("Helvetica", 10)).pack(padx=16, pady=(0, 10), anchor="w")

        body = ttk.Frame(win, padding=(14, 10))
        body.pack(fill="both", expand=True)
        body.columnconfigure(0, weight=1)

        ttk.Separator(body).grid(row=0, column=0, sticky="ew", pady=(0, 8))
        ttk.Label(body, text="Live Link", font=("Helvetica", 11, "bold")).grid(
            row=1, column=0, sticky="w", pady=(0, 6))

        if url:
            url_var   = tk.StringVar(value=url)
            url_entry = ttk.Entry(body, textvariable=url_var, state="readonly",
                                  font=("Menlo", 11))
            url_entry.grid(row=2, column=0, sticky="ew", pady=(0, 6))

            link_btns = ttk.Frame(body)
            link_btns.grid(row=3, column=0, sticky="w", pady=(0, 10))

            copy_lbl = tk.StringVar(value="Copy Link")
            def copy_url(u=url):
                self.clipboard_clear()
                self.clipboard_append(u)
                copy_lbl.set("Copied!")
                win.after(2000, lambda: copy_lbl.set("Copy Link"))
            ttk.Button(link_btns, textvariable=copy_lbl,
                       command=copy_url).pack(side="left", padx=(0, 8))
            ttk.Button(link_btns, text="Open in Browser",
                       command=lambda u=url: webbrowser.open(u)).pack(side="left")
        else:
            ttk.Label(body,
                      text="Set a Site Domain in Settings to generate a live link.",
                      foreground="#c0860a").grid(row=2, column=0, sticky="w", pady=(0, 10))

        ttk.Separator(body).grid(row=4, column=0, sticky="ew", pady=(0, 8))
        badge_frame = tk.Frame(body, bg="#1a1a2e", padx=10, pady=6)
        badge_frame.grid(row=5, column=0, sticky="w", pady=(0, 8))
        tk.Label(badge_frame, text="▶  LIVE", bg="#1a1a2e", fg="#4ec94e",
                 font=("Helvetica", 11, "bold")).pack(side="left", padx=(0, 10))
        tk.Label(badge_frame, text=f"Current build  ·  Uploaded {upload_ts}",
                 bg="#1a1a2e", fg="#c8c8c8",
                 font=("Helvetica", 10)).pack(side="left")

        ttk.Separator(body).grid(row=6, column=0, sticky="ew", pady=(0, 8))
        ttk.Label(body, text=f"Archives  —  {project}",
                  font=("Helvetica", 11, "bold")).grid(row=7, column=0, sticky="w", pady=(0, 6))

        arc_outer = ttk.Frame(body)
        arc_outer.grid(row=8, column=0, sticky="nsew", pady=(0, 6))
        arc_outer.columnconfigure(0, weight=1)
        arc_outer.rowconfigure(0, weight=1)
        body.rowconfigure(8, weight=1)

        cols = ("folder", "date", "time")
        tree = ttk.Treeview(arc_outer, columns=cols, show="headings",
                             selectmode="browse", height=6)
        tree.heading("folder", text="Archive Folder")
        tree.heading("date",   text="Date")
        tree.heading("time",   text="Time")
        tree.column("folder", width=310)
        tree.column("date",   width=110, anchor="center")
        tree.column("time",   width=80,  anchor="center")
        sb = ttk.Scrollbar(arc_outer, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=sb.set)
        tree.grid(row=0, column=0, sticky="nsew")
        sb.grid(row=0, column=1, sticky="ns")

        arc_status = tk.StringVar(value="Loading archives…")
        ttk.Label(body, textvariable=arc_status,
                  foreground="#666").grid(row=9, column=0, sticky="w", pady=(0, 8))

        ttk.Separator(body).grid(row=10, column=0, sticky="ew", pady=(0, 8))
        bot = ttk.Frame(body)
        bot.grid(row=11, column=0, sticky="w")

        restore_btn = ttk.Button(
            bot, text="Restore Selected", state="disabled",
            command=lambda: self._run_restore(win, tree, project, arc_status))
        restore_btn.pack(side="left", padx=(0, 8))

        copy_arc_lbl = tk.StringVar(value="Copy Archive Link")
        copy_arc_btn = ttk.Button(bot, textvariable=copy_arc_lbl, state="disabled",
                                  command=lambda: self._copy_archive_link(
                                      tree, project, base, cfg, copy_arc_lbl, win))
        copy_arc_btn.pack(side="left", padx=(0, 8))
        ttk.Button(bot, text="Close", command=win.destroy).pack(side="left")

        def _on_tree_select(_):
            has_sel = bool(tree.selection())
            restore_btn.config(state="normal" if has_sel else "disabled")
            copy_arc_btn.config(state="normal" if has_sel else "disabled")

        tree.bind("<<TreeviewSelect>>", _on_tree_select)

        threading.Thread(
            target=self._fetch_archives_thread,
            args=(project, archive_dir, tree, arc_status, win),
            daemon=True
        ).start()


if __name__ == "__main__":
    app = App()
    app.mainloop()
