import path from 'path';
import fs from 'fs';

/**
 * Tra ve duong dan tuyet doi den thu muc uploads cua he thong.
 * Tu dong tao thu muc neu chua ton tai.
 */
export function getUploadsDir(): string {
  // Neu chay tu thu muc goc cua repo
  if (fs.existsSync(path.resolve(process.cwd(), 'backend'))) {
    const dir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  // Neu chay tu ben trong thu muc backend
  if (path.basename(process.cwd()) === 'backend') {
    const dir = path.resolve(process.cwd(), '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
