import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { MultipartFile } from '@fastify/multipart';
import type { UploadAsset } from '@buggy/shared-types';
import type { SessionUser } from './auth.service.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const uploadRoot = process.env.UPLOAD_DIR || join(moduleDir, '../../uploads');

@Injectable()
export class UploadService {
  async save(file: MultipartFile, projectId: string | undefined, _user: SessionUser): Promise<UploadAsset> {
    const buffer = await file.toBuffer();
    const id = randomUUID();
    const name = safeName(file.filename || `attachment${extname(file.mimetype || '')}`);
    const dir = join(uploadRoot, id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    return {
      id,
      projectId,
      name,
      url: `/api/uploads/${id}/${encodeURIComponent(name)}`,
      size: buffer.byteLength,
      mimeType: file.mimetype || 'application/octet-stream',
      createdAt: new Date().toISOString()
    };
  }

  async read(id: string, name: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const safeId = id.replace(/[^a-zA-Z0-9-]/g, '');
    const safeFileName = safeName(name);
    if (!safeId || !safeFileName) throw new NotFoundException('文件不存在');
    const buffer = await readFile(join(uploadRoot, safeId, safeFileName)).catch(() => null);
    if (!buffer) throw new NotFoundException('文件不存在');
    return { buffer, mimeType: mimeOf(safeFileName), name: safeFileName };
  }
}

function safeName(name: string) {
  const normalized = decodeURIComponent(name).split(/[\\/]/).pop() || 'attachment';
  return normalized.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(0, 120);
}

function mimeOf(name: string) {
  const ext = extname(name).toLowerCase();
  const mimes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.log': 'text/plain; charset=utf-8',
    '.json': 'application/json',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip'
  };
  return mimes[ext] || 'application/octet-stream';
}
