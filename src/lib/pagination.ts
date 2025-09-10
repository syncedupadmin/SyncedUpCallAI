export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MAX_OFFSET: 10000,
  DEFAULT_OFFSET: 0
} as const;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  
  let limit = limitParam ? parseInt(limitParam, 10) : PAGINATION.DEFAULT_LIMIT;
  let offset = offsetParam ? parseInt(offsetParam, 10) : PAGINATION.DEFAULT_OFFSET;
  
  // Validate and clamp values
  if (isNaN(limit) || limit < 1) {
    limit = PAGINATION.DEFAULT_LIMIT;
  } else if (limit > PAGINATION.MAX_LIMIT) {
    limit = PAGINATION.MAX_LIMIT;
  }
  
  if (isNaN(offset) || offset < 0) {
    offset = PAGINATION.DEFAULT_OFFSET;
  } else if (offset > PAGINATION.MAX_OFFSET) {
    offset = PAGINATION.MAX_OFFSET;
  }
  
  return { limit, offset };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number
): PaginatedResponse<T> {
  return {
    data,
    total,
    limit,
    offset,
    hasMore: offset + data.length < total
  };
}