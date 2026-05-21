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
const uploadPublicBaseUrl = (process.env.UPLOAD_PUBLIC_BASE_URL || 'https://cdn.alvinclub.com/decom/pub').replace(/\/+$/, '');

@Injectable()
export class UploadService {
  async save(file: MultipartFile, projectId: string | undefined, _user: SessionUser): Promise<UploadAsset> {
    const buffer = await file.toBuffer();
    const id = randomUUID();
    const name = safeName(file.filename || `attachment${extensionOf(file.mimetype)}`);
    const uploadedAt = new Date();
    const datePath = datePathOf(uploadedAt);
    const objectName = `${id.replace(/-/g, '')}${extname(name) || extensionOf(file.mimetype)}`;
    const dir = join(uploadRoot, datePath);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, objectName), buffer);
    return {
      id,
      projectId,
      name,
      url: `${uploadPublicBaseUrl}/${datePath}/${encodeURIComponent(objectName)}`,
      size: buffer.byteLength,
      mimeType: file.mimetype || 'application/octet-stream',
      createdAt: uploadedAt.toISOString()
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

function extensionOf(mimeType = '') {
  const extensions: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/json': '.json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/zip': '.zip'
  };
  return extensions[mimeType.toLowerCase()] || '';
}

function datePathOf(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
