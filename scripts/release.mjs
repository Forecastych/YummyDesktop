// Сборка релиза: подписанный установщик + latest.json для автообновления.
// Запуск: npm run release [-- "что нового"]. Результат — в release/, все три файла
// заливаются в релиз v<версия> на GitHub (см. README, «Выпуск версии»).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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

console.log(`\nГотово: ${OUT}/${name}, ${name}.sig, latest.json — залейте их в релиз v${version}.`)
