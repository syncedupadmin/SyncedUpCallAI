'use client';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
  loading?: boolean;
}

export default function Pagination({ 
  total, 
  limit, 
  offset, 
  onPageChange,
  loading = false 
}: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const hasNext = offset + limit < total;
  const hasPrev = offset > 0;

  const handlePrevious = () => {
    if (hasPrev && !loading) {
      onPageChange(Math.max(0, offset - limit));
    }
  };

  const handleNext = () => {
    if (hasNext && !loading) {
      onPageChange(offset + limit);
    }
  };

  const handlePageSelect = (page: number) => {
    if (!loading) {
      onPageChange((page - 1) * limit);
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 7;
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  if (total === 0) {
    return null;
  }

  const startItem = offset + 1;
  const endItem = Math.min(offset + limit, total);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 0',
      fontSize: '14px'
    }}>
      <div style={{ opacity: 0.7 }}>
        Showing {startItem}-{endItem} of {total}
      </div>
      
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={handlePrevious}
          disabled={!hasPrev || loading}
          style={{
            padding: '6px 12px',
            border: '1px solid #374151',
            borderRadius: '4px',
            background: 'transparent',
            color: hasPrev && !loading ? '#fff' : '#6b7280',
            cursor: hasPrev && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.5 : 1
          }}
        >
          Previous
        </button>
        
        <div style={{ display: 'flex', gap: '4px' }}>
          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={`ellipsis-${index}`} style={{ padding: '6px 8px' }}>...</span>
            ) : (
              <button
                key={page}
                onClick={() => handlePageSelect(page as number)}
                disabled={loading}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                  background: currentPage === page ? '#374151' : 'transparent',
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  minWidth: '32px'
                }}
              >
                {page}
              </button>
            )
          ))}
        </div>
        
        <button
          onClick={handleNext}
          disabled={!hasNext || loading}
          style={{
            padding: '6px 12px',
            border: '1px solid #374151',
            borderRadius: '4px',
            background: 'transparent',
            color: hasNext && !loading ? '#fff' : '#6b7280',
            cursor: hasNext && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.5 : 1
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}