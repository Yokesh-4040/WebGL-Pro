/*
   Unity WebGL On-Screen Error Logger Overlay
   Applied dynamically by WebGL QA Suite
*/
(function() {
    var overlay = document.createElement('div');
    overlay.id = 'webgl-qa-error-overlay';
    overlay.style.cssText = [
        'position: fixed',
        'bottom: 10px',
        'left: 10px',
        'right: 10px',
        'max-height: 150px',
        'background: rgba(26, 0, 0, 0.9)',
        'border: 2px solid #ff3333',
        'border-radius: 6px',
        'color: #ff9999',
        'font-family: monospace',
        'font-size: 11px',
        'padding: 8px',
        'overflow-y: auto',
        'z-index: 999999',
        'box-shadow: 0 4px 15px rgba(0,0,0,0.5)',
        'display: none'
    ].join(';');

    var header = document.createElement('div');
    header.style.cssText = 'font-weight: bold; border-bottom: 1px solid #ff3333; padding-bottom: 4px; margin-bottom: 4px; display: flex; justify-content: space-between;';
    header.innerHTML = '<span>⚠️ WebGL Error Console Logs</span><span id="close-qa-console" style="cursor:pointer; color:#fff;">[Clear & Close]</span>';
    overlay.appendChild(header);

    var list = document.createElement('div');
    list.id = 'webgl-qa-error-list';
    overlay.appendChild(list);

    document.body.appendChild(overlay);

    document.getElementById('close-qa-console').onclick = function() {
        list.innerHTML = '';
        overlay.style.display = 'none';
    };

    function logError(msg, source, line) {
        overlay.style.display = 'block';
        var entry = document.createElement('div');
        entry.style.cssText = 'border-bottom: 1px solid rgba(255,51,51,0.2); padding: 4px 0; word-break: break-all;';
        entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg + (source ? ' (' + source + ':' + line + ')' : '');
        list.appendChild(entry);
        overlay.scrollTop = overlay.scrollHeight;
    }

    // Intercept window errors
    window.onerror = function(message, source, lineno, colno, error) {
        logError(message, source, lineno);
        return false;
    };

    // Override console.error
    var origConsoleError = console.error;
    console.error = function() {
        var args = Array.prototype.slice.call(arguments);
        logError(args.join(' '));
        origConsoleError.apply(console, arguments);
    };

    console.warn("WebGL QA Error Console injected successfully.");
})();
