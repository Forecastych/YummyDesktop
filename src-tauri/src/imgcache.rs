//! Дисковый кэш картинок со схемой `yimg://`.
//!
//! WebView грузит постеры напрямую со static.yani.tv, и при медленном CDN часть картинок
//! висит или падает навсегда: повтора у `<img>` нет, а свой HTTP-кэш WebView2 держит
//! по своим правилам. Поэтому картинки идут через нас:
//!
//! * адрес `http://yimg.localhost/<хост>/<путь>` (на Windows; `yimg://localhost/...` на остальных);
//! * попадание — файл с диска, без сети; промах — качаем с таймаутом и повторами,
//!   не больше `MAX_PARALLEL` загрузок разом, и кладём на диск атомарно (tmp + rename);
//! * размер кэша ограничен: при превышении лимита фоново удаляются самые давние
//!   по времени последнего обращения (mtime), пока не останется `EVICT_TO` от лимита;
//! * в WebView ответ уходит с `no-store`, чтобы картинка не лежала на диске дважды.
//!
//! Хосты — только белый список: иначе схема стала бы открытым прокси для любой страницы.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::Semaphore;

pub const SCHEME: &str = "yimg";

const ALLOWED_HOSTS: [&str; 3] = ["yani.tv", "yummyani.me", "yummy-anime.ru"];
const MAX_PARALLEL: usize = 6;
/// Больше — отдаём, но не кэшируем: это уже не постер, а обои.
const MAX_ITEM: usize = 4 * 1024 * 1024;
const DEFAULT_LIMIT_MB: u64 = 300;
const MIN_LIMIT_MB: u64 = 50;
const EVICT_TO: f64 = 0.8;
const RETRIES: u32 = 2;
/// Чаще не трогаем mtime при попадании — лишняя запись на диск на каждый показ постера.
const TOUCH_EVERY: Duration = Duration::from_secs(3600);

pub struct ImgCache {
    dir: PathBuf,
    size: AtomicU64,
    files: AtomicU64,
    limit: AtomicU64,
    evicting: AtomicBool,
    tmp_seq: AtomicU64,
    client: reqwest::Client,
    gate: Semaphore,
}

#[derive(Serialize)]
pub struct CacheStats {
    size: u64,
    files: u64,
    limit: u64,
}

impl ImgCache {
    pub fn new(dir: PathBuf) -> Arc<Self> {
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .user_agent(concat!("YummyAnimeDesktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("http client");
        let me = Arc::new(Self {
            dir,
            size: AtomicU64::new(0),
            files: AtomicU64::new(0),
            limit: AtomicU64::new(DEFAULT_LIMIT_MB * 1024 * 1024),
            evicting: AtomicBool::new(false),
            tmp_seq: AtomicU64::new(0),
            client,
            gate: Semaphore::new(MAX_PARALLEL),
        });
        // Размер уже лежащего на диске считаем в фоне — старт окна это не задерживает.
        let scan = me.clone();
        std::thread::spawn(move || {
            let _ = fs::create_dir_all(&scan.dir);
            let (size, files) = walk(&scan.dir).iter().fold((0, 0), |(s, n), f| (s + f.len, n + 1));
            scan.size.fetch_add(size, Ordering::Relaxed);
            scan.files.fetch_add(files, Ordering::Relaxed);
            scan.maybe_evict();
        });
        me
    }

    fn path_for(&self, key: u64) -> PathBuf {
        let hex = format!("{key:016x}");
        self.dir.join(&hex[..2]).join(hex)
    }

    fn stats(&self) -> CacheStats {
        CacheStats {
            size: self.size.load(Ordering::Relaxed),
            files: self.files.load(Ordering::Relaxed),
            limit: self.limit.load(Ordering::Relaxed),
        }
    }

    fn store(&self, path: &Path, bytes: &[u8]) -> std::io::Result<()> {
        fs::create_dir_all(path.parent().unwrap_or(&self.dir))?;
        let existed = fs::metadata(path).map(|m| m.len()).ok();
        let tmp = path.with_extension(format!("tmp{}", self.tmp_seq.fetch_add(1, Ordering::Relaxed)));
        {
            let mut f = fs::File::create(&tmp)?;
            f.write_all(bytes)?;
        }
        if let Err(e) = fs::rename(&tmp, path) {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
        match existed {
            Some(old) => {
                self.size.fetch_sub(old.min(self.size.load(Ordering::Relaxed)), Ordering::Relaxed);
            }
            None => {
                self.files.fetch_add(1, Ordering::Relaxed);
            }
        }
        self.size.fetch_add(bytes.len() as u64, Ordering::Relaxed);
        Ok(())
    }

    /// Самые давние по обращению — вон, пока не уложимся в `EVICT_TO` от лимита.
    fn maybe_evict(self: &Arc<Self>) {
        let limit = self.limit.load(Ordering::Relaxed);
        if self.size.load(Ordering::Relaxed) <= limit || self.evicting.swap(true, Ordering::AcqRel) {
            return;
        }
        let me = self.clone();
        std::thread::spawn(move || {
            let mut all = walk(&me.dir);
            all.sort_by_key(|f| f.mtime);
            let mut total: u64 = all.iter().map(|f| f.len).sum();
            let mut files = all.len() as u64;
            let target = (limit as f64 * EVICT_TO) as u64;
            for f in &all {
                if total <= target {
                    break;
                }
                if fs::remove_file(&f.path).is_ok() {
                    total -= f.len;
                    files -= 1;
                }
            }
            me.size.store(total, Ordering::Relaxed);
            me.files.store(files, Ordering::Relaxed);
            me.evicting.store(false, Ordering::Release);
        });
    }

    fn clear(&self) -> std::io::Result<()> {
        // Переименовываем и удаляем уже отдельную папку: новые записи не попадут под удаление.
        let trash = self.dir.with_extension(format!("old{}", self.tmp_seq.fetch_add(1, Ordering::Relaxed)));
        if self.dir.exists() && fs::rename(&self.dir, &trash).is_err() {
            // Windows не даёт переименовать папку, пока в ней открыт файл (как раз отдаём картинку).
            // Тогда удаляем поштучно: занятое останется и посчитается.
            let (mut size, mut files) = (0, 0);
            for f in walk(&self.dir) {
                if fs::remove_file(&f.path).is_err() {
                    size += f.len;
                    files += 1;
                }
            }
            self.size.store(size, Ordering::Relaxed);
            self.files.store(files, Ordering::Relaxed);
            return Ok(());
        }
        self.size.store(0, Ordering::Relaxed);
        self.files.store(0, Ordering::Relaxed);
        fs::create_dir_all(&self.dir)?;
        std::thread::spawn(move || {
            let _ = fs::remove_dir_all(trash);
        });
        Ok(())
    }
}

struct FileInfo {
    path: PathBuf,
    len: u64,
    mtime: SystemTime,
}

fn walk(dir: &Path) -> Vec<FileInfo> {
    let mut out = Vec::new();
    let Ok(subs) = fs::read_dir(dir) else { return out };
    for sub in subs.flatten() {
        let Ok(entries) = fs::read_dir(sub.path()) else { continue };
        for e in entries.flatten() {
            let Ok(m) = e.metadata() else { continue };
            if !m.is_file() {
                continue;
            }
            // Обрывки от упавшей записи.
            if e.path().extension().is_some() {
                let _ = fs::remove_file(e.path());
                continue;
            }
            out.push(FileInfo { path: e.path(), len: m.len(), mtime: m.modified().unwrap_or(SystemTime::UNIX_EPOCH) });
        }
    }
    out
}

/// FNV-1a: стабилен между запусками, в отличие от `DefaultHasher`.
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn sniff(b: &[u8]) -> &'static str {
    match b {
        [0xFF, 0xD8, 0xFF, ..] => "image/jpeg",
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [b'G', b'I', b'F', b'8', ..] => "image/gif",
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => "image/webp",
        [_, _, _, _, b'f', b't', b'y', b'p', b'a', b'v', b'i', b'f', ..] => "image/avif",
        [_, _, _, _, b'f', b't', b'y', b'p', b'a', b'v', b'i', b's', ..] => "image/avif",
        _ if b.starts_with(b"<svg") || b.starts_with(b"<?xml") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn allowed(host: &str) -> bool {
    ALLOWED_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
}

/// `http://yimg.localhost/static.yani.tv/posters/x.webp?_r=1` → `https://static.yani.tv/posters/x.webp`.
/// `_r` — номер повтора с фронта, чтобы WebView не склеил его с упавшим запросом; в ключ не входит.
fn upstream(req: &Request<Vec<u8>>) -> Option<String> {
    let uri = req.uri();
    let path = uri.path().trim_start_matches('/');
    let (host, rest) = path.split_once('/')?;
    if !allowed(host) || rest.is_empty() || rest.contains("..") {
        return None;
    }
    let mut url = format!("https://{host}/{rest}");
    let query: Vec<&str> = uri.query().unwrap_or("").split('&').filter(|p| !p.is_empty() && !p.starts_with("_r=")).collect();
    if !query.is_empty() {
        url.push('?');
        url.push_str(&query.join("&"));
    }
    Some(url)
}

fn respond(status: StatusCode, mime: &str, body: Vec<u8>, from: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Cache-Control", "no-store")
        .header("Access-Control-Allow-Origin", "*")
        .header("X-Cache", from)
        .body(body)
        .unwrap_or_default()
}

fn fail(status: StatusCode) -> Response<Vec<u8>> {
    respond(status, "text/plain", Vec::new(), "error")
}

enum Fetched {
    Ok(Vec<u8>, String),
    /// Ответ сервера окончательный — повторять бессмысленно (404 и т.п.).
    Final(StatusCode),
    Failed,
}

async fn fetch_once(client: &reqwest::Client, url: &str) -> Fetched {
    let Ok(r) = client.get(url).send().await else { return Fetched::Failed };
    let status = r.status();
    if status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Fetched::Failed;
    }
    if !status.is_success() {
        return Fetched::Final(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY));
    }
    let mime = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_owned();
    match r.bytes().await {
        Ok(b) => Fetched::Ok(b.to_vec(), mime),
        Err(_) => Fetched::Failed,
    }
}

async fn handle(cache: Arc<ImgCache>, req: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(url) = upstream(&req) else { return fail(StatusCode::FORBIDDEN) };
    let path = cache.path_for(fnv1a(&url));

    let hit = {
        let path = path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let bytes = fs::read(&path).ok()?;
            let stale = fs::metadata(&path)
                .and_then(|m| m.modified())
                .map(|t| t.elapsed().unwrap_or_default() > TOUCH_EVERY)
                .unwrap_or(false);
            if stale {
                let _ = fs::File::options().write(true).open(&path).and_then(|f| f.set_modified(SystemTime::now()));
            }
            Some(bytes)
        })
        .await
        .ok()
        .flatten()
    };
    if let Some(bytes) = hit {
        if !bytes.is_empty() {
            return respond(StatusCode::OK, sniff(&bytes), bytes, "hit");
        }
    }

    let Ok(_permit) = cache.gate.acquire().await else { return fail(StatusCode::SERVICE_UNAVAILABLE) };
    let mut attempt = 0;
    let (bytes, mime) = loop {
        match fetch_once(&cache.client, &url).await {
            Fetched::Ok(b, m) => break (b, m),
            Fetched::Final(s) => return fail(s),
            Fetched::Failed if attempt < RETRIES => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(400 * 3u64.pow(attempt - 1))).await;
            }
            Fetched::Failed => return fail(StatusCode::BAD_GATEWAY),
        }
    };
    drop(_permit);

    let sniffed = sniff(&bytes);
    let is_image = sniffed.starts_with("image/") || mime.starts_with("image/");
    if !is_image {
        return fail(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
    let mime = if sniffed.starts_with("image/") { sniffed.to_owned() } else { mime };
    if bytes.len() <= MAX_ITEM {
        let c = cache.clone();
        let data = bytes.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if c.store(&path, &data).is_ok() {
                c.maybe_evict();
            }
        });
    }
    respond(StatusCode::OK, &mime, bytes, "miss")
}

pub fn protocol<R: Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    req: Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let cache = ctx.app_handle().state::<Arc<ImgCache>>().inner().clone();
    tauri::async_runtime::spawn(async move { responder.respond(handle(cache, req).await) });
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let dir = app.path().app_cache_dir()?.join("images");
    app.manage(ImgCache::new(dir));
    Ok(())
}

#[tauri::command]
pub fn img_cache_stats(cache: State<'_, Arc<ImgCache>>) -> CacheStats {
    cache.stats()
}

#[tauri::command]
pub fn img_cache_set_limit(cache: State<'_, Arc<ImgCache>>, mb: u64) -> CacheStats {
    cache.limit.store(mb.max(MIN_LIMIT_MB) * 1024 * 1024, Ordering::Relaxed);
    cache.maybe_evict();
    cache.stats()
}

#[tauri::command]
pub async fn img_cache_clear(cache: State<'_, Arc<ImgCache>>) -> Result<CacheStats, String> {
    let c = cache.inner().clone();
    tauri::async_runtime::spawn_blocking(move || c.clear().map(|_| c.stats()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(path: &str) -> Request<Vec<u8>> {
        Request::builder().uri(format!("http://yimg.localhost/{path}")).body(Vec::new()).unwrap()
    }

    fn wait_for(mut ok: impl FnMut() -> bool) {
        for _ in 0..100 {
            if ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("не дождались");
    }

    #[test]
    fn upstream_whitelist_and_retry_param() {
        assert_eq!(upstream(&req("static.yani.tv/a/b.webp?_r=2")).as_deref(), Some("https://static.yani.tv/a/b.webp"));
        assert_eq!(upstream(&req("static.yani.tv/u/1.webp?v=3&_r=1")).as_deref(), Some("https://static.yani.tv/u/1.webp?v=3"));
        assert!(upstream(&req("evil.com/x.png")).is_none());
        assert!(upstream(&req("yani.tv.evil.com/x.png")).is_none());
        assert!(upstream(&req("static.yani.tv/../x")).is_none());
    }

    /// Живой CDN: промах качает и кладёт на диск, повтор отдаётся с диска, лимит вытесняет.
    #[test]
    #[ignore = "ходит в сеть"]
    fn live_miss_hit_evict_clear() {
        let dir = std::env::temp_dir().join(format!("yimg-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let cache = ImgCache::new(dir.clone());
        let posters = ["1636691934", "1636986649"];

        let r = tauri::async_runtime::block_on(handle(cache.clone(), req(&format!("static.yani.tv/posters/small/{}.webp", posters[0]))));
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(r.headers()["X-Cache"], "miss");
        assert_eq!(r.headers()["Content-Type"], "image/webp");
        let len = r.body().len() as u64;
        wait_for(|| cache.stats().files == 1);
        assert_eq!(cache.stats().size, len);

        let r = tauri::async_runtime::block_on(handle(cache.clone(), req(&format!("static.yani.tv/posters/small/{}.webp?_r=1", posters[0]))));
        assert_eq!(r.headers()["X-Cache"], "hit");
        assert_eq!(r.body().len() as u64, len);

        let r = tauri::async_runtime::block_on(handle(cache.clone(), req("evil.com/x.png")));
        assert_eq!(r.status(), StatusCode::FORBIDDEN);
        let r = tauri::async_runtime::block_on(handle(cache.clone(), req("static.yani.tv/posters/small/nope-404.webp")));
        assert!(r.status().is_client_error(), "{}", r.status());

        // Лимит меньше двух постеров: второй вытеснит более давний первый.
        std::thread::sleep(Duration::from_millis(20));
        cache.limit.store(len + len / 2, Ordering::Relaxed);
        let r = tauri::async_runtime::block_on(handle(cache.clone(), req(&format!("static.yani.tv/posters/small/{}.webp", posters[1]))));
        assert_eq!(r.status(), StatusCode::OK);
        let path = |p: &str| cache.path_for(fnv1a(&format!("https://static.yani.tv/posters/small/{p}.webp")));
        wait_for(|| path(posters[1]).exists() && !path(posters[0]).exists() && !cache.evicting.load(Ordering::Acquire));
        assert_eq!(cache.stats().files, 1);

        cache.clear().unwrap();
        assert_eq!(cache.stats().files, 0);
        assert!(walk(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
