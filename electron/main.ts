import { app, BrowserWindow, ipcMain, shell, session, desktopCapturer, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';
import AdmZip from 'adm-zip';

// Resolve __dirname in ES module scope
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let fileServer: http.Server | null = null;

const PORT = 8000;
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Fallback MIME mappings for WebGL builds
const MIME_MAPPING: { [key: string]: string } = {
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.js': 'application/javascript',
  '.symbols.json': 'application/octet-stream',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse config.json:', e);
    }
  }
  return { projects: {} };
}

// Start Node.js WebGL local file server inside Electron main process
function startWebGLServer() {
  fileServer = http.createServer((req, res) => {
    // Add CORS headers to all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || '');
    const pathname = parsedUrl.pathname || '';

    if (pathname.startsWith('/project-builds/')) {
      const parts = pathname.substring(1).split('/');
      if (parts.length >= 2) {
        const projectName = parts[1];
        const subpath = parts.slice(2).join('/');
        
        const config = loadConfig();
        const project = config.projects?.[projectName];
        
        if (project && project.build_folder) {
          const buildFolder = project.build_folder;
          let filePath = path.join(buildFolder, subpath);
          
          // Default to index.html if a directory is loaded
          if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
          }

          if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            const ext = path.extname(filePath).toLowerCase();
            let contentType = MIME_MAPPING[ext] || 'application/octet-stream';
            let contentEncoding: string | null = null;

            // Handle gzip and brotli compression formats (.gz and .br)
            if (ext === '.gz') {
              contentEncoding = 'gzip';
              const baseFile = filePath.slice(0, -3);
              const subExt = path.extname(baseFile).toLowerCase();
              contentType = MIME_MAPPING[subExt] || 'application/octet-stream';
            } else if (ext === '.br') {
              contentEncoding = 'br';
              const baseFile = filePath.slice(0, -3);
              const subExt = path.extname(baseFile).toLowerCase();
              contentType = MIME_MAPPING[subExt] || 'application/octet-stream';
            }

            const stat = fs.statSync(filePath);
            res.writeHead(200, {
              'Content-Type': contentType,
              ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
              'Content-Length': stat.size.toString(),
            });

            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            return;
          }
        }
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  fileServer.listen(PORT, () => {
    console.log(`Node Local Bridge serving WebGL builds on http://localhost:${PORT}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Turn off webSecurity to allow loading iframe from port 8000 inside port 5173
    },
    titleBarStyle: 'default',
    backgroundColor: '#06060c',
  });

  // Load dashboard in dev or production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Redirect target="_blank" window creations to native system browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers mapping
function setupIPCHandlers() {
  // Select folder on local disk
  ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Unity WebGL Build Directory',
      properties: ['openDirectory'],
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });

  // Validate path on local disk
  ipcMain.handle('validate-path', async (_event, folderPath: string) => {
    try {
      return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
    } catch {
      return false;
    }
  });

  // Apply templates
  ipcMain.handle('apply-fix', async (_event, { buildFolder, fixType }) => {
    try {
      if (!fs.existsSync(buildFolder) || !fs.statSync(buildFolder).isDirectory()) {
        return { error: 'Folder does not exist.' };
      }

      const indexHtmlPath = path.join(buildFolder, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) {
        return { error: 'index.html not found.' };
      }

      const templateDataDir = path.join(buildFolder, 'TemplateData');
      if (!fs.existsSync(templateDataDir)) {
        fs.mkdirSync(templateDataDir, { recursive: true });
      }

      let htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

      if (fixType === 'mobile_responsive') {
        const srcCss = path.join(TEMPLATES_DIR, 'mobile_responsive.css');
        const destCss = path.join(templateDataDir, 'mobile_responsive.css');
        fs.copyFileSync(srcCss, destCss);

        const linkTag = '<link rel="stylesheet" href="TemplateData/mobile_responsive.css">';
        if (!htmlContent.includes(linkTag)) {
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `  ${linkTag}\n</head>`);
          } else {
            htmlContent = linkTag + '\n' + htmlContent;
          }
        }
      } else if (fixType === 'error_overlay') {
        const srcJs = path.join(TEMPLATES_DIR, 'error_overlay.js');
        const destJs = path.join(templateDataDir, 'error_overlay.js');
        fs.copyFileSync(srcJs, destJs);

        const scriptTag = '<script src="TemplateData/error_overlay.js"></script>';
        if (!htmlContent.includes(scriptTag)) {
          if (htmlContent.includes('</body>')) {
            htmlContent = htmlContent.replace('</body>', `${scriptTag}\n</body>`);
          } else {
            htmlContent = htmlContent + '\n' + scriptTag;
          }
        }
      } else {
        return { error: `Unknown fix type: ${fixType}` };
      }

      fs.writeFileSync(indexHtmlPath, htmlContent, 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Revert template fixes
  ipcMain.handle('revert-fix', async (_event, { buildFolder, fixType }) => {
    try {
      if (!fs.existsSync(buildFolder) || !fs.statSync(buildFolder).isDirectory()) {
        return { error: 'Folder does not exist.' };
      }

      const indexHtmlPath = path.join(buildFolder, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) {
        return { error: 'index.html not found.' };
      }

      let htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

      if (fixType === 'mobile_responsive') {
        const linkTag = '<link rel="stylesheet" href="TemplateData/mobile_responsive.css">';
        htmlContent = htmlContent.replace(linkTag + '\n', '').replace(linkTag, '');
        
        const destCss = path.join(buildFolder, 'TemplateData', 'mobile_responsive.css');
        if (fs.existsSync(destCss)) {
          fs.unlinkSync(destCss);
        }
      } else if (fixType === 'error_overlay') {
        const scriptTag = '<script src="TemplateData/error_overlay.js"></script>';
        htmlContent = htmlContent.replace(scriptTag + '\n', '').replace(scriptTag, '');
        
        const destJs = path.join(buildFolder, 'TemplateData', 'error_overlay.js');
        if (fs.existsSync(destJs)) {
          fs.unlinkSync(destJs);
        }
      } else {
        return { error: `Unknown fix type: ${fixType}` };
      }

      fs.writeFileSync(indexHtmlPath, htmlContent, 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Open link in default external browser
  ipcMain.handle('open-external', async (_event, urlString: string) => {
    try {
      await shell.openExternal(urlString);
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Get all local project path mappings from config.json
  ipcMain.handle('get-all-local-paths', async () => {
    const config = loadConfig();
    return config.projects || {};
  });

  // Save local path mapping to config.json
  ipcMain.handle('save-local-path', async (_event, projectName: string, buildFolder: string) => {
    try {
      const config = loadConfig();
      if (!config.projects) config.projects = {};
      config.projects[projectName] = { build_folder: buildFolder };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Zip local folder and return buffer
  ipcMain.handle('zip-folder', async (_event, buildFolder: string) => {
    try {
      if (!fs.existsSync(buildFolder) || !fs.statSync(buildFolder).isDirectory()) {
        return { error: 'Folder does not exist or is not a directory.' };
      }
      const zip = new AdmZip();
      zip.addLocalFolder(buildFolder);
      const buffer = zip.toBuffer();
      return buffer;
    } catch (e: any) {
      return { error: e.message };
    }
  });

  // Unzip build archive to user data folder and save to config.json
  ipcMain.handle('unzip-build', async (_event, projectName: string, zipArrayBuffer: ArrayBuffer) => {
    try {
      const buildsDir = path.join(app.getPath('userData'), 'downloaded-builds');
      const buildFolder = path.join(buildsDir, projectName);

      if (!fs.existsSync(buildsDir)) {
        fs.mkdirSync(buildsDir, { recursive: true });
      }

      if (fs.existsSync(buildFolder)) {
        fs.rmSync(buildFolder, { recursive: true, force: true });
      }
      fs.mkdirSync(buildFolder, { recursive: true });

      const buffer = Buffer.from(zipArrayBuffer);
      const zip = new AdmZip(buffer);
      zip.extractAllTo(buildFolder, true);

      // Save to config
      const config = loadConfig();
      if (!config.projects) config.projects = {};
      config.projects[projectName] = { build_folder: buildFolder };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

      return { buildFolder };
    } catch (e: any) {
      return { error: e.message };
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  // 1. Setup local WebGL HTTP hosting server
  startWebGLServer();

  // 2. Setup screen recorder window handler (macOS / Windows native picker dialog)
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      // Pick first available screen automatically or fallback
      const target = sources.find((s) => s.name.toLowerCase().includes('entire screen') || s.name.toLowerCase().includes('screen 1')) || sources[0];
      callback({ videoSource: target, audioSource: 'loopback' });
    });
  }, { useSystemPicker: true });

  // 3. Setup IPC callbacks
  setupIPCHandlers();

  // 4. Create Desktop Window container
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (fileServer) {
    fileServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
