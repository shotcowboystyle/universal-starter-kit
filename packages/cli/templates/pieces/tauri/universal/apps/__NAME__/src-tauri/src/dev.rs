//! The dev shell. A dev build loads the dev server, so the window holds on a
//! waiting page until the app's client modules answer and a Develop menu
//! gives it Reload and devtools accelerators. A release build loads its
//! bundled frontend and needs neither, and a mobile build has no menu API.

#[cfg(all(dev, desktop))]
pub use shell::setup;

#[cfg(not(all(dev, desktop)))]
pub fn setup<R: tauri::Runtime>(_app: &tauri::App<R>) -> tauri::Result<()> {
    Ok(())
}

#[cfg(all(dev, desktop))]
mod shell {
    use std::collections::{HashSet, VecDeque};
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    use tauri::menu::{Menu, MenuItem, Submenu};
    use tauri::{Manager, Runtime, Url, WebviewWindow};

    const RELOAD: &str = "reload";
    const DEVTOOLS: &str = "devtools";

    /// True while the main window shows the waiting page. Whoever clears it
    /// (the gate once the client graph settles, or Reload pressed on the
    /// waiting page) is the one that loads the app.
    static WAITING: AtomicBool = AtomicBool::new(false);

    const WAITING_PAGE: &str = r#"data:text/html,<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:system-ui,-apple-system,sans-serif;background:rgb(26,26,46);color:rgb(224,224,224);
display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;margin:0}
h1{font-size:1.6rem;margin-bottom:1rem;color:white}
code{background:rgb(18,18,42);padding:.3rem .6rem;border-radius:6px;font-size:1rem;color:rgb(112,214,255);
border:1px solid rgb(48,48,90)}
p{margin:.8rem 0;font-size:.95rem;color:rgb(153,153,153)}
.dot{display:inline-block;animation:blink .7s infinite alternate}
.dot:nth-child(2){animation-delay:.2s}
.dot:nth-child(3){animation-delay:.4s}
@keyframes blink{from{opacity:.1}to{opacity:1}}
</style></head>
<body>
<h1>Waiting for the dev server<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></h1>
<p>Start it if it is not running:</p>
<code>pnpm dev</code>
<p>Reload (Cmd/Ctrl+R) loads the app without waiting.</p>
<p id="tauri-dev-status" style="margin-top:2rem;font-size:.85rem;color:rgb(102,102,102)">waiting for DEV_URL</p>
</body></html>"#;

    pub fn setup<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
        let url = url(app);
        menu(app, url.clone())?;
        if let Some(window) = app.get_webview_window("main") {
            gate(window, url);
        }
        Ok(())
    }

    /// TAURI_DEV_URL wins outright; ONE_PORT replaces the port of the
    /// configured devUrl, which is how `make one/tauri` follows the repo .env.
    fn url<R: Runtime>(app: &tauri::App<R>) -> Url {
        if let Some(url) = std::env::var("TAURI_DEV_URL")
            .ok()
            .and_then(|value| value.parse().ok())
        {
            return url;
        }
        let mut url = app
            .config()
            .build
            .dev_url
            .clone()
            .unwrap_or_else(|| "http://localhost:3456".parse().expect("literal url"));
        if let Some(port) = std::env::var("ONE_PORT")
            .ok()
            .and_then(|value| value.parse().ok())
        {
            let _ = url.set_port(Some(port));
        }
        url
    }

    fn menu<R: Runtime>(app: &tauri::App<R>, url: Url) -> tauri::Result<()> {
        let handle = app.handle();
        let reload = MenuItem::with_id(handle, RELOAD, "Reload", true, Some("CmdOrCtrl+R"))?;
        let devtools = MenuItem::with_id(
            handle,
            DEVTOOLS,
            "Toggle Developer Tools",
            true,
            Some("CmdOrCtrl+Alt+I"),
        )?;
        let develop = Submenu::with_items(handle, "Develop", true, &[&reload, &devtools])?;
        let menu = Menu::default(handle)?;
        menu.append(&develop)?;
        app.set_menu(menu)?;
        app.on_menu_event(move |app, event| {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            match event.id().as_ref() {
                RELOAD => {
                    if WAITING.swap(false, Ordering::SeqCst) {
                        let _ = window.navigate(url.clone());
                    } else {
                        let _ = window.eval("window.location.reload()");
                    }
                }
                #[cfg(debug_assertions)]
                DEVTOOLS => {
                    if window.is_devtools_open() {
                        window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
                _ => {}
            }
        });
        Ok(())
    }

    /// The window shows the waiting page until two crawls in a row walk the
    /// same client graph with no 504. A 504 means the optimizer re-bundled
    /// under the crawl, and a changed graph means it re-bundled between two,
    /// so either starts over: the app is loaded only once the optimizer has
    /// settled, which is what makes the first paint hydrate on a cold .vite
    /// cache.
    fn gate<R: Runtime>(window: WebviewWindow<R>, url: Url) {
        WAITING.store(true, Ordering::SeqCst);
        let _ = window.navigate(
            WAITING_PAGE
                .replace("DEV_URL", url.as_str())
                .parse()
                .expect("data url"),
        );
        std::thread::spawn(move || {
            let status = |text: String| {
                let text = serde_json::to_string(&text).unwrap_or_default();
                let _ = window.eval(format!(
                    "(document.getElementById('tauri-dev-status') || {{}}).textContent = {text}"
                ));
            };
            let mut previous: Option<HashSet<String>> = None;
            while WAITING.load(Ordering::SeqCst) {
                match warm(&url, &status) {
                    Ok(modules) if previous.as_ref() == Some(&modules) => {
                        log::info!(
                            "{url}: {} client modules settled, loading the app",
                            modules.len()
                        );
                        if WAITING.swap(false, Ordering::SeqCst) {
                            let _ = window.navigate(url);
                        }
                        return;
                    }
                    Ok(modules) => {
                        status(format!(
                            "{} client modules answered, checking the optimizer settled",
                            modules.len()
                        ));
                        previous = Some(modules);
                    }
                    Err(reason) => {
                        status(reason);
                        previous = None;
                    }
                }
                std::thread::sleep(Duration::from_secs(1));
            }
        });
    }

    fn warm(base: &Url, status: &dyn Fn(String)) -> Result<HashSet<String>, String> {
        let mut seen = HashSet::new();
        let Some(document) = document(base)? else {
            return Ok(seen);
        };
        let mut queue: VecDeque<String> = module_scripts(&document.body).into_iter().collect();
        while let Some(path) = queue.pop_front() {
            if !seen.insert(path.clone()) {
                continue;
            }
            let response = fetch(base, &path, "*/*")?;
            match response.status {
                200 if response.javascript => queue.extend(imports(&response.body)),
                504 => return Err(format!("{path} is outdated, the optimizer re-bundled")),
                _ => {}
            }
            if seen.len() % 50 == 0 {
                status(format!("warming client modules ({})", seen.len()));
            }
        }
        Ok(seen)
    }

    /// The document the window will load, following same-origin redirects.
    /// None when it redirects off-origin (an auth server, say): there is
    /// nothing of the app's own to warm, so the window loads it as is.
    fn document(base: &Url) -> Result<Option<Response>, String> {
        let mut path = request_path(base);
        for _ in 0..5 {
            let response = fetch(base, &path, "text/html,*/*;q=0.8")?;
            match (response.status, response.location.as_deref()) {
                (200, _) => return Ok(Some(response)),
                (300..=399, Some(location)) => {
                    let target = base
                        .join(location)
                        .map_err(|error| format!("redirect to {location}: {error}"))?;
                    if target.origin() != base.origin() {
                        return Ok(None);
                    }
                    path = request_path(&target);
                }
                (status, _) => return Err(format!("the document answered {status}")),
            }
        }
        Err("the document keeps redirecting".to_string())
    }

    fn request_path(url: &Url) -> String {
        match url.query() {
            Some(query) => format!("{}?{query}", url.path()),
            None => url.path().to_string(),
        }
    }

    #[derive(Debug)]
    struct Response {
        status: u16,
        javascript: bool,
        location: Option<String>,
        body: String,
    }

    fn fetch(base: &Url, path: &str, accept: &str) -> Result<Response, String> {
        let host = base.host_str().ok_or("the dev url has no host")?;
        let port = base.port_or_known_default().unwrap_or(80);
        let addrs = (host, port)
            .to_socket_addrs()
            .map_err(|error| format!("{host}:{port} does not resolve ({error})"))?;
        let stream = addrs
            .filter_map(|addr| TcpStream::connect_timeout(&addr, Duration::from_secs(2)).ok())
            .next();
        let mut stream = stream.ok_or_else(|| format!("waiting for {host}:{port}"))?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nAccept: {accept}\r\nConnection: close\r\n\r\n"
        )
        .map_err(|error| error.to_string())?;
        let mut raw = Vec::new();
        stream
            .read_to_end(&mut raw)
            .map_err(|error| format!("{path}: {error}"))?;
        parse(&raw).ok_or_else(|| format!("{path}: malformed response"))
    }

    fn parse(raw: &[u8]) -> Option<Response> {
        let split = find(raw, b"\r\n\r\n")?;
        let head = String::from_utf8_lossy(&raw[..split]);
        let mut lines = head.lines();
        let status = lines.next()?.split_whitespace().nth(1)?.parse().ok()?;
        let mut chunked = false;
        let mut javascript = false;
        let mut location = None;
        for line in lines {
            let Some((name, value)) = line.split_once(':') else {
                continue;
            };
            let value = value.trim();
            match name.trim().to_ascii_lowercase().as_str() {
                "transfer-encoding" => chunked = value.to_ascii_lowercase().contains("chunked"),
                "content-type" => javascript = value.to_ascii_lowercase().contains("javascript"),
                "location" => location = Some(value.to_string()),
                _ => {}
            }
        }
        let body = &raw[split + 4..];
        let body = if chunked {
            dechunk(body)
        } else {
            body.to_vec()
        };
        Some(Response {
            status,
            javascript,
            location,
            body: String::from_utf8_lossy(&body).into_owned(),
        })
    }

    fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
        haystack
            .windows(needle.len())
            .position(|window| window == needle)
    }

    fn dechunk(body: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut rest = body;
        while let Some(line_end) = find(rest, b"\r\n") {
            let size_field = String::from_utf8_lossy(&rest[..line_end]);
            let size = size_field
                .split(';')
                .next()
                .and_then(|hex| usize::from_str_radix(hex.trim(), 16).ok())
                .unwrap_or(0);
            if size == 0 {
                break;
            }
            let start = line_end + 2;
            let end = (start + size).min(rest.len());
            out.extend_from_slice(&rest[start..end]);
            rest = &rest[(end + 2).min(rest.len())..];
        }
        out
    }

    fn module_scripts(html: &str) -> Vec<String> {
        let mut found = Vec::new();
        for (index, _) in html.match_indices("<script") {
            let Some(end) = html[index..].find('>') else {
                break;
            };
            let tag = &html[index..index + end];
            if !tag.contains("type=\"module\"") && !tag.contains("type='module'") {
                continue;
            }
            if let Some(src) = attribute(tag, "src").filter(|src| same_origin(src)) {
                found.push(src);
            }
        }
        found
    }

    fn attribute(tag: &str, name: &str) -> Option<String> {
        let start = tag.find(&format!(" {name}="))? + name.len() + 2;
        let quote = tag[start..].chars().next()?;
        if quote != '"' && quote != '\'' {
            return None;
        }
        let value = &tag[start + 1..];
        Some(value[..value.find(quote)?].to_string())
    }

    fn imports(source: &str) -> Vec<String> {
        let mut found = Vec::new();
        for keyword in ["from", "import"] {
            for (index, _) in source.match_indices(keyword) {
                let mut rest = source[index + keyword.len()..].trim_start();
                if let Some(inner) = rest.strip_prefix('(') {
                    rest = inner.trim_start();
                }
                let Some(quote) = rest.chars().next().filter(|c| matches!(*c, '"' | '\'')) else {
                    continue;
                };
                let literal = &rest[1..];
                let Some(end) = literal.find(quote) else {
                    continue;
                };
                let specifier = &literal[..end];
                if same_origin(specifier) && !specifier.contains(char::is_whitespace) {
                    found.push(specifier.to_string());
                }
            }
        }
        found
    }

    fn same_origin(path: &str) -> bool {
        path.starts_with('/') && !path.starts_with("//")
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn module_scripts_reads_the_bootstrap_tags_react_writes() {
            let html = concat!(
                r#"<head><script type="module" src="/@one/dev.js"></script></head><body>"#,
                r#"<script type="module" src="/@vite/client" async=""></script>"#,
                r#"<script type="module" src="/@id/__x00__virtual:one-entry" async=""></script>"#,
                r#"<script src="/classic.js"></script>"#,
                r#"<script type="module">import "/inline.js"</script>"#,
                r#"<script type='module' src='//cdn.example/x.js'></script></body>"#,
            );
            assert_eq!(
                module_scripts(html),
                [
                    "/@one/dev.js",
                    "/@vite/client",
                    "/@id/__x00__virtual:one-entry"
                ]
            );
        }

        #[test]
        fn imports_follows_static_dynamic_and_side_effect_imports_on_the_server() {
            let source = concat!(
                "import __vite__cjsImport0_react from \"/node_modules/.vite/deps/react.js?v=1a2b\";\n",
                "import { x } from '/app/features/x.tsx';\n",
                "import \"/app/global.css\";\n",
                "const routes = { './a.tsx': () => import(\"/app/routes/a.tsx\") };\n",
                "const list = Array.from(items);\n",
                "import.meta.hot?.accept();\n",
                "import bare from 'react';\n",
                "import cdn from '//cdn.example/x.js';\n",
            );
            let mut found = imports(source);
            found.sort();
            assert_eq!(
                found,
                [
                    "/app/features/x.tsx",
                    "/app/global.css",
                    "/app/routes/a.tsx",
                    "/node_modules/.vite/deps/react.js?v=1a2b",
                ]
            );
        }

        #[test]
        fn parse_reads_a_sized_javascript_response() {
            let raw = b"HTTP/1.1 200 OK\r\nContent-Type: text/javascript\r\nContent-Length: 11\r\n\r\nexport {};\n";
            let response = parse(raw).expect("response");
            assert_eq!(response.status, 200);
            assert!(response.javascript);
            assert_eq!(response.body, "export {};\n");
        }

        #[test]
        fn parse_dechunks_a_chunked_document() {
            let raw = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n6\r\n<html>\r\n7\r\n</html>\r\n0\r\n\r\n";
            let response = parse(raw).expect("response");
            assert!(!response.javascript);
            assert_eq!(response.body, "<html></html>");
        }

        #[test]
        fn parse_keeps_the_outdated_optimize_dep_status_and_redirect_location() {
            let outdated = parse(b"HTTP/1.1 504 Outdated Optimize Dep\r\n\r\n").expect("504");
            assert_eq!(outdated.status, 504);
            let redirect =
                parse(b"HTTP/1.1 307 Temporary Redirect\r\nLocation: /home\r\n\r\n").expect("307");
            assert_eq!(redirect.status, 307);
            assert_eq!(redirect.location.as_deref(), Some("/home"));
        }

        #[test]
        fn request_path_keeps_the_query() {
            let url: Url = "http://localhost:3456/backoffice?tab=1".parse().unwrap();
            assert_eq!(request_path(&url), "/backoffice?tab=1");
            let root: Url = "http://localhost:3456".parse().unwrap();
            assert_eq!(request_path(&root), "/");
        }
    }
}
