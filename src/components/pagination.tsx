import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

export function Pagination({ currentPage, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <PaginationRoot>
      <PaginationContent>
        <PaginationItem>
          {currentPage > 1 ? (
            <PaginationPrevious href={`${basePath}/${currentPage - 1}`} />
          ) : (
            <PaginationPrevious 
              href="#" 
              className="pointer-events-none opacity-50"
              aria-disabled="true"
            />
          )}
        </PaginationItem>
        
        {/* ページ1 */}
        {currentPage > 2 && (
          <PaginationItem>
            <PaginationLink href={`${basePath}/1`}>1</PaginationLink>
          </PaginationItem>
        )}
        
        {/* 省略記号 */}
        {currentPage > 3 && (
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        )}
        
        {/* 前のページ */}
        {currentPage > 1 && (
          <PaginationItem>
            <PaginationLink href={`${basePath}/${currentPage - 1}`}>
              {currentPage - 1}
            </PaginationLink>
          </PaginationItem>
        )}
        
        {/* 現在のページ */}
        <PaginationItem>
          <PaginationLink href={`${basePath}/${currentPage}`} isActive>
            {currentPage}
          </PaginationLink>
        </PaginationItem>
        
        {/* 次のページ */}
        {currentPage < totalPages && (
          <PaginationItem>
            <PaginationLink href={`${basePath}/${currentPage + 1}`}>
              {currentPage + 1}
            </PaginationLink>
          </PaginationItem>
        )}
        
        {/* 省略記号 */}
        {currentPage < totalPages - 2 && (
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        )}
        
        {/* 最後のページ */}
        {currentPage < totalPages - 1 && (
          <PaginationItem>
            <PaginationLink href={`${basePath}/${totalPages}`}>
              {totalPages}
            </PaginationLink>
          </PaginationItem>
        )}
        
        <PaginationItem>
          {currentPage < totalPages ? (
            <PaginationNext href={`${basePath}/${currentPage + 1}`} />
          ) : (
            <PaginationNext 
              href="#" 
              className="pointer-events-none opacity-50"
              aria-disabled="true"
            />
          )}
        </PaginationItem>
      </PaginationContent>
    </PaginationRoot>
  );
}