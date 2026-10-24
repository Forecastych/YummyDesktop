// Список аниме пользователя Shikimori — для импорта в списки YummyAnime.
// Идёт отсюда, а не из WebView: API Шикимори требует User-Agent, а из браузера
// его не задать (и CORS там не для нас).
use std::time::Duration;

use serde::{Deserialize, Serialize};

const API: &str = "https://shikimori.io/api/users";
/// Максимум, который отдаёт anime_rates за раз.
const PAGE: usize = 5000;
/// Страховка от бесконечного цикла, если API начнёт вести себя странно.
const MAX_PAGES: u32 = 10;

#[derive(Deserialize)]
struct RawRate {
    score: u32,
    status: String,
    episodes: u32,
    /// null у манги и ранобэ.
    anime: Option<RawAnime>,
}

#[derive(Deserialize)]
struct RawAnime {
    id: u64,
}

#[derive(Serialize)]
pub struct Rate {
    shikimori_id: u64,
    status: String,
    score: u32,
    episodes: u32,
}

/// user — id или никнейм на Шикимори.
#[tauri::command]
pub async fn shiki_rates(user: String) -> Result<Vec<Rate>, String> {
    if user.is_empty() || user.len() > 64 {
        return Err("Не указан пользователь Shikimori".into());
    }
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("YummyAnimeDesktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for page in 1..=MAX_PAGES {
        let mut url = reqwest::Url::parse(API).expect("static url");
        url.path_segments_mut().expect("http url").push(&user).push("anime_rates");
        url.query_pairs_mut().append_pair("limit", &PAGE.to_string()).append_pair("page", &page.to_string());

        let resp = client.get(url).send().await.map_err(|e| format!("Shikimori не отвечает: {e}"))?;
        match resp.status().as_u16() {
            200 => {}
            404 => return Err("Пользователь Shikimori не найден".into()),
            403 => return Err("Список на Shikimori скрыт настройками приватности".into()),
            429 => return Err("Shikimori просит подождать — попробуйте через минуту".into()),
            s => return Err(format!("Shikimori ответил {s}")),
        }
        let body = resp.bytes().await.map_err(|e| e.to_string())?;
        let rates: Vec<RawRate> = serde_json::from_slice(&body).map_err(|e| format!("Непонятный ответ Shikimori: {e}"))?;
        // Шикимори отдаёт limit+1 записей, если есть следующая страница.
        let more = rates.len() > PAGE;
        out.extend(rates.into_iter().take(PAGE).filter_map(|r| {
            let a = r.anime?;
            Some(Rate { shikimori_id: a.id, status: r.status, score: r.score, episodes: r.episodes })
        }));
        if !more {
            break;
        }
    }
    Ok(out)
}
