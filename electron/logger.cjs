const fs = require('node:fs');
const path = require('node:path');

function timestamp(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

function fileStamp(date = new Date()) {
  return timestamp(date).replace(/[-:]/g, '').replace(' ', '-').slice(0, 15);
}

/** 오래된 로그부터 지워 최근 keep개만 남긴다. */
function pruneLogs(dir, keep) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^game-\d{8}-\d{6}.*\.log$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep + 1))) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      // 다른 인스턴스가 쓰는 중이면 다음 실행 때 정리된다
    }
  }
}

/**
 * 실행마다 새 로그 파일을 만든다. 크래시 직전 기록이 남도록 동기 쓰기를 쓴다.
 */
function createLogger(dir, keep) {
  fs.mkdirSync(dir, { recursive: true });
  pruneLogs(dir, keep);
  const file = path.join(dir, `game-${fileStamp()}-${process.pid}.log`);

  const write = (level, message) => {
    const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}\n`;
    try {
      fs.appendFileSync(file, line);
    } catch {
      // 디스크 문제로 로그를 못 쓰더라도 게임은 계속 진행
    }
    if (level === 'error') console.error(line.trimEnd());
    else console.log(line.trimEnd());
  };

  return {
    dir,
    file,
    info: (msg) => write('info', msg),
    warn: (msg) => write('warn', msg),
    error: (msg) => write('error', msg),
  };
}

module.exports = { createLogger };
