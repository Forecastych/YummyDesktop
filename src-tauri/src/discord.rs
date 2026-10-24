// Статус «Смотрит …» в Discord через его локальный IPC: именованный канал
// \\.\pipe\discord-ipc-N, кадры «опкод u32 LE + длина u32 LE + JSON».
// Без отдельного крейта: нужен только SET_ACTIVITY. Всё общение — в своём потоке,
// чтобы зависший или закрытый Discord не тормозил интерфейс.
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

/// Discord пускает не больше 5 SET_ACTIVITY за 20 секунд.
const MIN_GAP: Duration = Duration::from_secs(4);
/// Пауза, за которую склеиваем частые обновления (play/pause/перемотка подряд).
const SETTLE: Duration = Duration::from_millis(800);
/// Как часто пробовать подключиться, если Discord не запущен.
const RETRY: Duration = Duration::from_secs(20);

struct Wanted {
    client_id: String,
    activity: Option<Value>,
}

static TX: Mutex<Option<Sender<Wanted>>> = Mutex::new(None);

/// Статус для Discord. activity = null — убрать статус. Пустой client_id — отключиться.
#[tauri::command]
pub fn discord_set(client_id: String, activity: Option<Value>) {
    let mut tx = TX.lock().unwrap_or_else(|e| e.into_inner());
    let mut msg = Wanted { client_id, activity };
    if let Some(t) = tx.as_ref() {
        match t.send(msg) {
            Ok(()) => return,
            Err(mpsc::SendError(m)) => msg = m, // поток умер — поднимем новый
        }
    }
    let (t, r) = mpsc::channel();
    let _ = t.send(msg);
    *tx = Some(t);
    let _ = thread::Builder::new().name("discord-rpc".into()).spawn(move || worker(r));
}

struct Conn {
    pipe: File,
    client_id: String,
}

fn worker(rx: Receiver<Wanted>) {
    let mut want: Option<Wanted> = None;
    let mut conn: Option<Conn> = None;
    let mut dirty = false;
    let mut last_sent = Instant::now() - MIN_GAP;
    let mut nonce = 0u64;
    loop {
        let wait = if dirty { RETRY } else { Duration::from_secs(3600) };
        match rx.recv_timeout(wait) {
            Ok(w) => {
                want = Some(w);
                // Склеиваем пачку обновлений в одно — остаётся последнее.
                while let Ok(w) = rx.recv_timeout(SETTLE) {
                    want = Some(w);
                }
                dirty = true;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let Some(w) = want.as_ref() else { continue };
        if !dirty {
            continue;
        }

        if w.client_id.is_empty() {
            conn = None; // закрытие канала само убирает статус
            dirty = false;
            continue;
        }
        if conn.as_ref().is_some_and(|c| c.client_id != w.client_id) {
            conn = None;
        }
        if conn.is_none() {
            match connect(&w.client_id) {
                Some(c) => conn = Some(c),
                None => continue, // Discord не запущен — попробуем через RETRY
            }
        }

        let gap = last_sent.elapsed();
        if gap < MIN_GAP {
            thread::sleep(MIN_GAP - gap);
        }
        let c = conn.as_mut().expect("подключились выше");
        nonce += 1;
        let cmd = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": w.activity },
            "nonce": nonce.to_string(),
        });
        last_sent = Instant::now();
        // Отказ в самом статусе (evt ERROR) повтором не лечится — ждём следующего обновления.
        match send(&mut c.pipe, OP_FRAME, &cmd).and_then(|_| reply(&mut c.pipe)) {
            Ok(_) => dirty = false,
            Err(_) => conn = None, // Discord закрылся — переподключимся на следующем круге
        }
    }
}

fn connect(client_id: &str) -> Option<Conn> {
    for i in 0..10 {
        let Ok(mut pipe) = OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\discord-ipc-{i}")) else {
            continue;
        };
        let hello = json!({ "v": 1, "client_id": client_id });
        // Ответ на рукопожатие — READY; при неверном client_id Discord закрывает канал.
        let ready = send(&mut pipe, OP_HANDSHAKE, &hello).and_then(|_| reply(&mut pipe));
        if ready.is_ok_and(|r| r.get("evt").and_then(Value::as_str) == Some("READY")) {
            return Some(Conn { pipe, client_id: client_id.to_string() });
        }
    }
    None
}

fn send(pipe: &mut File, op: u32, body: &Value) -> std::io::Result<()> {
    let data = serde_json::to_vec(body)?;
    let mut frame = Vec::with_capacity(8 + data.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(data.len() as u32).to_le_bytes());
    frame.extend_from_slice(&data);
    pipe.write_all(&frame)?;
    pipe.flush()
}

/// Дочитать ответ на команду (или ошибку — она тоже кадр с evt ERROR): канал синхронный, непрочитанные ответы копились бы в нём.
fn reply(pipe: &mut File) -> std::io::Result<Value> {
    loop {
        let mut head = [0u8; 8];
        pipe.read_exact(&mut head)?;
        let op = u32::from_le_bytes(head[0..4].try_into().unwrap());
        let len = u32::from_le_bytes(head[4..8].try_into().unwrap()) as usize;
        if len > 1 << 20 {
            return Err(std::io::Error::other("слишком большой кадр"));
        }
        let mut buf = vec![0u8; len];
        pipe.read_exact(&mut buf)?;
        let body: Value = serde_json::from_slice(&buf).unwrap_or(Value::Null);
        match op {
            OP_PING => send(pipe, OP_PONG, &body)?,
            OP_CLOSE => return Err(std::io::Error::other(body.to_string())),
            _ => return Ok(body),
        }
    }
}
