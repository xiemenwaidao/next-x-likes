import { Badge } from '@/components/ui/badge';
import { announcements } from '@/data/announcements';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

export function AnnouncementList() {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground text-center">
        <p>いいねの備忘録。</p>
        <p>毎朝5時過ぎに自動更新。</p>
      </div>
      
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {announcements.map((item) => (
          <div 
            key={item.id}
            className="group hover:bg-muted/50 rounded-md p-1.5 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="text-sm mt-0.5">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-medium text-foreground">{item.title}</span>
                  {item.isNew && (
                    <>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      <Badge variant="secondary" className="text-[8px] px-1 py-0">NEW</Badge>
                    </>
                  )}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground flex-1">
                    {item.description}
                  </p>
                  <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
                    {formatDate(item.date)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}