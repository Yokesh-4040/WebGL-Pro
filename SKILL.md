---
name: unity-webgl-automation
description: Automates uploading, archiving, and configuring Unity WebGL builds via FTP, with support for dynamic version menu injection and automatic .htaccess generation.
---

# Unity WebGL Automation Skill

This document is a technical guide and operational skill specification for AI agents working on the **Unity WebGL Automation** project. It outlines the codebase structure, technical workflows, GUI architecture, and best practices for developing, testing, and debugging the automation tool.

---

## 1. Overview & Capabilities

Unity WebGL builds consist of complex multi-part assets (webassembly, binaries, index wrapper, template styles). Deploying these manually via FTP requires creating directories, configuring MIME types, renaming files to avoid spaces, and managing version rollbacks.

This system solves these issues through a Python 3 Tkinter GUI application ([uploader.py](file:///Users/Yokesh_Work/Desktop/Unity%20WebGL%20Automation/uploader.py)) that automates:
1. **Multi-mode Uploads**: Choose between full uploads, template-only, or data-only uploads.
2. **Automated Archiving**: Moves the active live build to a timestamped archive folder on the FTP server before uploading new code.
3. **Rollback & Restore**: Reverts the live build to any archived state with a single click.
4. **Filename Sanitisation**: Replaces spaces with underscores in build filenames and dynamically updates references inside `index.html` in-memory.
5. **Dynamic Version Selection Menu**: Injects a floating HTML version switcher widget at the bottom of the page that queries a remote `versions.json` list at runtime.
6. **Automatic `.htaccess` Configuration**: Generates and uploads `.htaccess` configuration files matching the build's compression scheme (`gzip`, `brotli`, or uncompressed) to resolve hosting issues (e.g., MIME types, decompression errors, and CORS).

---

## 2. Codebase Architecture

The project has a minimalist, zero-dependency codebase (outside standard Python GUI and FTP libraries):

```
/Users/Yokesh_Work/Desktop/Unity WebGL Automation/
├── Launch Uploader.command   # Executable launcher script for macOS
├── uploader.py               # Main application source containing UI and core logic
└── config.json               # Local application configurations and project directory paths
```

### [uploader.py](file:///Users/Yokesh_Work/Desktop/Unity%20WebGL%20Automation/uploader.py)
This is the single executable file containing:
- **Configurations and Utilities**: Configuration loader (`load_config`), saver (`save_config`), path helper (`abs_path`), directory existence checker (`ftp_dir_exists`), recursive directory creator (`ftp_makedirs`), and archive version list compiler (`ftp_list_archives`).
- **Main GUI Interface (`App` class)**: Extends `tk.Tk`. Contains:
  - **Upload Tab**: Project dropdown, directory path display, browse button, radio choices for upload modes and index.html injection, progress bar, real-time logging terminal, and actionable control buttons (Upload, Cancel, Copy Link).
  - **FTP Settings Tab**: Standard credential fields (Host, Username, Password, Site Domain, Base Directory) with connection testing functionality.
- **Worker Threads**:
  - `_test_thread()`: Checks FTP credentials by connecting to port 21 and logging in.
  - `_upload_thread()`: Performs the main upload logic (archiving, filtering files, renaming, patching, uploading blocks, creating `.htaccess`, injecting widgets, and updating `versions.json`).
  - `_fetch_archives_thread()` and `do_restore()`: Fetches the list of archive directories and performs server-side folder renames to roll back/forward.

### [config.json](file:///Users/Yokesh_Work/Desktop/Unity%20WebGL%20Automation/config.json)
This JSON file stores persistent local preferences:
- `ftp_host`: Target host URL.
- `ftp_user`: FTP username.
- `ftp_pass`: FTP password.
- `ftp_domain`: Domain name corresponding to the FTP folder root (used for building links).
- `base_dir`: The remote root folder (usually `public_html` or a subfolder like `ixr`).
- `inject_mode`: Injection preference (`none` or `inject`).
- `upload_mode`: Upload mode preference (`full`, `template`, or `data`).
- `upload_htaccess`: Boolean value defining whether to generate and upload `.htaccess`.
- `projects`: A key-value dictionary mapping project name strings to a configuration block containing their local `"build_folder"` absolute path.

---

## 3. Deep-Dive on Core Workflows

### A. Upload Modes
When an upload is started, files in the local build folder are scanned and filtered according to the selected mode:

| Mode | Files Uploaded | Remote Archiving | Description |
| :--- | :--- | :--- | :--- |
| **`full`** | All files in build folder | **Yes** | Replaces the entire live directory. Existing folder is moved to `archive/{project}_{timestamp}` first. |
| **`template`** | Excludes `/Build` folder | **No** | Overwrites template assets and `index.html` only. Faster upload for UI adjustments. |
| **`data`**| Only files inside `/Build` | **No** | Overwrites binary assets (WASM/data). Skips template and index files. |

### B. Directory Archiving and Restoring
1. **Archiving**: During a `full` upload, if the project directory (`{base_dir}/{project}`) already exists, the script renames it to `{base_dir}/archive/{project}_%Y%m%d_%H%M%S`.
2. **Restoring**: In the archives list UI, selecting an archive triggers a server-side swap:
   - The current live build is moved to a new timestamped folder: `archive/{project}_{timestamp}`.
   - The chosen archive folder is renamed back to the live build directory: `{base_dir}/{project}`.
   - This process utilizes fast FTP directory rename instructions (`ftp.rename()`), avoiding file transfers.

### C. Filename Sanitisation & Memory Patching
Browsers and servers can struggle with spaces in WebGL asset paths.
- The script checks local filenames inside the build directory.
- If spaces are found, it generates a sanitised filename replacing spaces with underscores.
- To prevent reference mismatches, `index.html` is loaded into memory, scanned for the matching filenames, patched with the underscores, and uploaded directly from memory as bytes via `io.BytesIO()`.

### D. Dynamic Version Menu Widget Injection
If widget injection is enabled, the script dynamically inserts a floating HTML component into `index.html`:
1. It updates a list of archives for the project and writes a file named `versions.json` in the live directory containing:
   ```json
   {
     "live_url": "https://domain.com/path/",
     "archives": [
       { "label": "20 May 2026 13:00", "url": "https://domain.com/path/archive/project_timestamp/" }
     ]
   }
   ```
2. It injects a script block just before the closing `</body>` tag of `index.html`.
3. This injected script runs client-side, fetches the relative `versions.json` dynamically (bypassing caching via a timestamp query parameter), and renders a responsive floating interface at the bottom-right corner of the window.
4. Users can open this floating panel to view, switch to, or compare the live build and all archived version builds directly from their browser.

### E. `.htaccess` Compression Mapping
Many web hosts fail to serve Unity's compressed files with correct HTTP response headers, causing WebGL initialization errors.
If `.htaccess` generation is enabled:
- The script scans the files to detect compression types: `.gz` signifies `gzip`, `.br` signifies `brotli`.
- It generates a custom `.htaccess` file containing mapping directives:
  - Configures standard MIME types (`AddType`) for `.wasm`, `.data`, and `.js`.
  - Sets appropriate `Content-Encoding` and `Content-Type` headers via `<FilesMatch>` wrappers.
  - Adds Cross-Origin Resource Sharing (CORS) headers: `Access-Control-Allow-Origin "*"`.
- The `.htaccess` file is uploaded directly to the root of the project directory.

---

## 4. Developer Operational Guide

### Thread Safety in Tkinter
The Python GUI runs on a single main thread. Executing blocking network requests (like long FTP operations) inside the GUI thread freezes the interface. 
- **Rule**: Run all connection tests, uploads, and restores on a separate thread using standard `threading.Thread(target=..., daemon=True).start()`.
- **Rule**: Worker threads **must not** modify Tkinter UI elements directly. Always queue UI modifications onto the main thread using the `after()` method (e.g., `self.after(0, self.status_var.set, msg)` or `win.after(0, populate)`).

### Running and Testing Locally
Ensure Python 3 is installed along with Tkinter.
- On macOS, Tkinter usually comes pre-packaged with Python, but if missing, install it via Homebrew:
  ```bash
  brew install python-tk
  ```
- Make the launch script executable:
  ```bash
  chmod +x "Launch Uploader.command"
  ```
- Run the command script or launch directly:
  ```bash
  python3 uploader.py
  ```

---

## 5. Implementation Reference & Design Decisions

### In-Memory File Injection Patterns
When writing code that modifies the file patching mechanism, ensure that:
- Files are parsed safely using appropriate byte encodings (defaulting to UTF-8 with `errors="replace"`).
- Injected code structures are clean, lightweight, and minified where possible to minimize payload size.
- Ensure the closing tags are identified correctly. If `</body>` is missing, the script falls back to appending the snippet to the end of the file.

```python
# Reference implementation of tag insertion
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
```

### FTP Error Recovery
If an upload fails mid-process or is cancelled by the user:
- The script preserves a cancellation flag check `self._cancel_flag.is_set()` in loop steps.
- If cancelled, it cleans up partial files and runs a restore of the previously backed-up folder (stored temporarily at `archived_path`).
- Maintain this safety mechanism during refactors to avoid corrupting production deployments.
