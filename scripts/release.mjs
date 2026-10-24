// Сборка релиза: подписанный NSIS + latest.json для автообновления, установщик
// в стиле приложения (setup/, внутри тот же NSIS) и портативный exe.
// Запуск: npm run release [-- "что нового"]. Результат — в release/, все файлы
// заливаются в релиз v<версия> на GitHub (см. README, «Выпуск версии»).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = 'Forecastych/YummyDesktop'
const KEY = join(homedir(), '.tauri', 'yummianime-desktop.key')
const NSIS = 'src-tauri/target/release/bundle/nsis'
const OUT = 'release'

const { version } = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const notes = process.argv[2] ?? ''

// Без приватного ключа tauri build соберёт установщик, но упадёт на подписи обновления.
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  if (!existsSync(KEY)) {
    console.error(`Нет ключа подписи: задайте TAURI_SIGNING_PRIVATE_KEY или положите ключ в ${KEY}`)
    process.exit(1)
  }
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(KEY, 'utf8')
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= ''
}

const build = spawnSync('npx', ['tauri', 'build'], { stdio: 'inherit', shell: true })
if (build.status !== 0) process.exit(build.status ?? 1)

const setup = readdirSync(NSIS).find((f) => f.endsWith(`_${version}_x64-setup.exe`))
if (!setup || !existsSync(join(NSIS, `${setup}.sig`))) {
  console.error(`В ${NSIS} нет установщика ${version} с подписью .sig`)
  process.exit(1)
}

// GitHub меняет пробелы в именах файлов релиза на точки — ссылка из latest.json бы не совпала.
const name = setup.replaceAll(' ', '-')
mkdirSync(OUT, { recursive: true })
copyFileSync(join(NSIS, setup), join(OUT, name))
copyFileSync(join(NSIS, `${setup}.sig`), join(OUT, `${name}.sig`))

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(join(NSIS, `${setup}.sig`), 'utf8').trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${name}`,
    },
  },
}
writeFileSync(join(OUT, 'latest.json'), JSON.stringify(latest, null, 2) + '\n')

// Оболочка зашивает в себя только что подписанный NSIS (include_bytes! по YD_PAYLOAD).
const shell = spawnSync('cargo', ['build', '--release', '--manifest-path', 'setup/Cargo.toml'], {
  stdio: 'inherit',
  env: { ...process.env, YD_PAYLOAD: resolve(NSIS, setup) },
})
if (shell.status !== 0) process.exit(shell.status ?? 1)
const pretty = `YummyAnime-Desktop-Setup-${version}.exe`
copyFileSync('setup/target/release/yummi-setup.exe', join(OUT, pretty))
copyFileSync('src-tauri/target/release/yummi-desktop.exe', join(OUT, 'YummyAnime-Desktop.exe'))

console.log(`\nГотово: ${OUT}/${pretty} (установщик для людей), YummyAnime-Desktop.exe (портативный),`)
console.log(`${name}, ${name}.sig, latest.json (автообновление) — залейте всё в релиз v${version}.`)
