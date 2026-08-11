// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/storage/storageService.ts
// Purpose: Storage service - secure file upload, download,
//          signed URLs. Every operation validates business ownership.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse, PagedResponse, PaginationRequest } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { UUID } from '../../types/database';
import type { FileObject } from '../../types/schema';
import { env, APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

// ---- Upload File -------------------------------------------

export interface UploadFileInput {
  file: File;
  entity_type: string;
  entity_id: UUID;
  branch_id?: UUID;
  category: 'receipt' | 'invoice' | 'logo' | 'product_image' | 'payslip' | 'attachment' | 'export';
}

export interface UploadResult {
  file_id: UUID;
  storage_path: string;
  bucket_name: string;
  signed_url: string;
}

export async function uploadFile(
  ctx: UserContext,
  input: UploadFileInput
): Promise<ServiceResponse<UploadResult>> {
  const requestId = makeRequestId();

  // Determine required module
  const module = input.category === 'payslip' ? 'payroll' : 'settings';
  if (!canDo(ctx, module, 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to upload files.', { requestId });
  }

  // Validate file size
  const maxSizeMB = input.category === 'export' ? APP_CONSTANTS.MAX_EXPORT_SIZE_MB
                  : input.category === 'logo' || input.category === 'product_image'
                    ? APP_CONSTANTS.MAX_IMAGE_SIZE_MB
                  : APP_CONSTANTS.MAX_DOCUMENT_SIZE_MB;

  if (input.file.size > maxSizeMB * 1024 * 1024) {
    return serviceFail('INVALID_INPUT', `File size exceeds the ${maxSizeMB}MB limit.`, { requestId, field: 'file' });
  }

  // Determine bucket
  const bucket = input.category === 'payslip' ? env.storage.bucketPayroll
               : input.category === 'export'  ? env.storage.bucketExports
               : input.category === 'logo' || input.category === 'product_image'
                 ? env.storage.bucketAssets
               : env.storage.bucketDocuments;

  try {
    // Register in file_metadata first to get file_id and path
    const { data: regData, error: regError } = await supabase.rpc('fn_register_upload', {
      p_business_id:   ctx.business_id,
      p_branch_id:     input.branch_id ?? null,
      p_uploaded_by:   ctx.user_id,
      p_bucket_name:   bucket,
      p_entity_type:   input.entity_type,
      p_entity_id:     input.entity_id,
      p_original_name: input.file.name,
      p_mime_type:     input.file.type,
      p_file_size:     input.file.size,
      p_category:      input.category,
      p_checksum:      null,
      p_expires_hours: input.category === 'export' ? 24 : null,
    });

    if (regError || !regData) {
      return serviceFail('INTERNAL_ERROR', 'Failed to register file.', { requestId });
    }

    const reg = regData as { file_id: UUID; storage_path: string; bucket_name: string };

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(reg.storage_path, input.file, { upsert: false });

    if (uploadError) {
      return serviceFail('INTERNAL_ERROR', 'File upload failed. Please try again.', { requestId });
    }

    // Get signed URL (60 min TTL)
    const { data: signedData } = await supabase.storage
      .from(bucket)
      .createSignedUrl(reg.storage_path, 3600);

    return serviceOk<UploadResult>({
      file_id:      reg.file_id,
      storage_path: reg.storage_path,
      bucket_name:  bucket,
      signed_url:   signedData?.signedUrl ?? '',
    }, requestId);

  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'File upload failed.', { requestId });
  }
}

// ---- Get Signed URL ----------------------------------------

export async function getSignedFileUrl(
  ctx: UserContext,
  fileId: UUID,
  expiresSeconds: number = 3600
): Promise<ServiceResponse<string>> {
  const requestId = makeRequestId();

  try {
    const { data: fileMeta, error: metaError } = await supabase
      .schema('imagecare')
      .from('file_metadata')
      .select('bucket_name, storage_path, business_id')
      .eq('id', fileId)
      .is('deleted_at', null)
      .single();

    if (metaError || !fileMeta) {
      return serviceFail('RESOURCE_NOT_FOUND', 'File not found.', { requestId });
    }

    if ((fileMeta as any).business_id !== ctx.business_id) {
      return serviceFail('PERMISSION_DENIED', 'You do not have access to this file.', { requestId });
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from((fileMeta as any).bucket_name)
      .createSignedUrl((fileMeta as any).storage_path, expiresSeconds);

    if (signedError || !signedData?.signedUrl) {
      return serviceFail('INTERNAL_ERROR', 'Failed to generate file URL.', { requestId });
    }

    // Log access
    await supabase.rpc('fn_log_file_access', {
      p_file_id:   fileId,
      p_user_id:   ctx.user_id,
      p_action:    'download',
      p_success:   true,
    }).catch(() => null);

    return serviceOk(signedData.signedUrl, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to get file URL.', { requestId });
  }
}

// ---- Delete File -------------------------------------------

export async function deleteFile(
  ctx: UserContext,
  fileId: UUID
): Promise<ServiceResponse<void>> {
  const requestId = makeRequestId();

  try {
    const { error } = await supabase.rpc('fn_soft_delete_file', {
      p_file_id: fileId,
      p_user_id: ctx.user_id,
      p_reason:  'User deleted',
    });

    if (error) return serviceFail('BUSINESS_RULE_VIOLATION', error.message, { requestId });
    return serviceOk(undefined, requestId);
  } catch (err) {
    return serviceFail('INTERNAL_ERROR', 'Failed to delete file.', { requestId });
  }
}

// ---- List Files --------------------------------------------

export async function listFiles(
  ctx: UserContext,
  filter: { entity_type?: string; entity_id?: UUID; category?: string } = {},
  pagination: PaginationRequest = {}
): Promise<ServiceResponse<PagedResponse<FileObject>>> {
  const requestId = makeRequestId();

  try {
    const pageSize = Math.min(pagination.page_size ?? 20, 100);
    const offset = ((pagination.page ?? 1) - 1) * pageSize;

    let query = supabase
      .schema('imagecare')
      .from('file_metadata')
      .select('*', { count: 'exact' })
      .eq('business_id', ctx.business_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false });

    if (filter.entity_type) query = query.eq('entity_type', filter.entity_type);
    if (filter.entity_id)   query = query.eq('entity_id', filter.entity_id);
    if (filter.category)    query = query.eq('category', filter.category);

    const { data, error, count } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load files.', { requestId });

    return serviceOk({
      items: (data ?? []) as FileObject[],
      pagination: { total_count: count ?? 0, page_size: pageSize, has_more: (offset + pageSize) < (count ?? 0), next_cursor_date: null, next_cursor_id: null },
    }, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to load files.', { requestId });
  }
}
