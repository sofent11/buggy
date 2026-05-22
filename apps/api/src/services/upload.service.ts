import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { MultipartFile } from '@fastify/multipart';
import type { UploadAsset } from '@buggy/shared-types';
import type { SessionUser } from './auth.service.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const uploadRoot = process.env.UPLOAD_DIR || join(moduleDir, '../../uploads');
const uploadProxyUrl = process.env.UPLOAD_PROXY_URL || 'https://www.cn2u.xyz/proxy-upload/gcp-image';
const uploadCdnBaseUrl = (process.env.UPLOAD_CDN_BASE_URL || 'https://cdn.alvinclub.com').replace(/\/+$/, '');

type UploadProxyResponse = {
  code?: number;
  data?: {
    url?: string;
    fullUrl?: string;
  };
  message?: string;
};

@Injectable()
export class UploadService {
  async save(file: MultipartFile, projectId: string | undefined, _user: SessionUser): Promise<UploadAsset> {
    const buffer = await file.toBuffer();
    const id = randomUUID();
    const name = safeName(file.filename || `attachment${extensionOf(file.mimetype)}`);
    const mimeType = file.mimetype || 'application/octet-stream';
    const uploaded = await uploadToProxy(buffer, name, mimeType);
    const uploadedAt = new Date();
    return {
      id,
      projectId,
      name,
      url: uploaded.fullUrl || toCdnUrl(uploaded.url),
      size: buffer.byteLength,
      mimeType,
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

async function uploadToProxy(buffer: Buffer, name: string, mimeType: string) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: mimeType }), name);
  formData.append('staticPath', 'false');

  const response = await fetch(uploadProxyUrl, {
    method: 'POST',
    body: formData
  });
  const payload = (await response.json().catch(() => null)) as UploadProxyResponse | null;
  if (!response.ok || !payload || payload.code !== 0 || !payload.data?.url) {
    throw new BadGatewayException(payload?.message || '附件上传到对象存储失败');
  }
  return payload.data;
}

function toCdnUrl(url?: string) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return url
      .split('?')[0]
      .replace('decom-cdn.s3.us-east-1.amazonaws.com', 'cdn.alvinclub.com')
      .replace('storage.googleapis.com/decom-cdn', 'cdn.alvinclub.com');
  }
  return `${uploadCdnBaseUrl}/${url.replace(/^\/+/, '')}`;
}
