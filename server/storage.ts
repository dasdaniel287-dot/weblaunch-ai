import fs from 'fs';
import path from 'path';

export interface ObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string;
}

export class LocalObjectStore {
  private readonly rootDir: string;

  constructor(dataDir: string) {
    this.rootDir = path.resolve(dataDir, 'r2');
    fs.mkdirSync(this.rootDir, {recursive: true});
  }

  private resolveSafeKey(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.includes('..') || normalized.includes('\0')) {
      throw new Error(`Invalid object storage key: ${key}`);
    }
    const target = path.resolve(this.rootDir, normalized);
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new Error('Storage key escapes namespace.');
    }
    return target;
  }

  putObject(key: string, data: Buffer): void {
    const target = this.resolveSafeKey(key);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, data);
  }

  getObject(key: string): Buffer | null {
    const target = this.resolveSafeKey(key);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return null;
    }
    return fs.readFileSync(target);
  }

  hasObject(key: string): boolean {
    const target = this.resolveSafeKey(key);
    return fs.existsSync(target) && fs.statSync(target).isFile();
  }

  deleteObject(key: string): void {
    const target = this.resolveSafeKey(key);
    if (fs.existsSync(target)) {
      fs.rmSync(target, {force: true});
    }
  }

  deletePrefix(prefix: string): void {
    const target = this.resolveSafeKey(prefix);
    if (fs.existsSync(target)) {
      fs.rmSync(target, {recursive: true, force: true});
    }
  }

  getTotalBytes(): number {
    let total = 0;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          total += fs.statSync(full).size;
        }
      }
    };
    walk(this.rootDir);
    return total;
  }
}
