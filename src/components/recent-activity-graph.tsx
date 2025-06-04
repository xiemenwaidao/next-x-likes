'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ActivityData {
  date: string;
  count: number;
  dayName: string;
}

interface RecentActivityGraphProps {
  activityData: ActivityData[];
}

export function RecentActivityGraph({ activityData }: RecentActivityGraphProps) {
  const maxCount = Math.max(...activityData.map(d => d.count));
  const totalCount = activityData.reduce((sum, d) => sum + d.count, 0);
  const average = Math.round(totalCount / activityData.length);
  
  // 傾向分析
  const firstHalf = activityData.slice(0, Math.ceil(activityData.length / 2));
  const secondHalf = activityData.slice(Math.ceil(activityData.length / 2));
  const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.count, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.count, 0) / secondHalf.length;
  
  const trend = secondHalfAvg > firstHalfAvg ? 'up' : secondHalfAvg < firstHalfAvg ? 'down' : 'stable';
  
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };
  
  const getTrendText = () => {
    switch (trend) {
      case 'up': return '上昇傾向';
      case 'down': return '下降傾向';
      default: return '安定';
    }
  };

  return (
    <div className="w-full max-w-[28rem] mx-auto">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">最近のいいね活動</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* グラフ */}
            <div className="h-32 flex items-end justify-between gap-1">
              {activityData.map((data, index) => {
                const height = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
                return (
                  <div key={data.date} className="flex flex-col items-center flex-1">
                    <div
                      className="w-full bg-primary rounded-t transition-all duration-700 ease-out min-h-[2px]"
                      style={{ 
                        height: `${Math.max(height, 2)}%`,
                        animationDelay: `${index * 100}ms`
                      }}
                      title={`${data.dayName}: ${data.count}個のいいね`}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      {data.dayName}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* 統計情報 */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                {getTrendIcon()}
                <span className="text-muted-foreground">{getTrendText()}</span>
              </div>
              <div className="text-muted-foreground">
                平均: {average}個/日
              </div>
            </div>
            
            <div className="text-2xl font-bold">
              合計 {totalCount} 個のいいね
            </div>
            <p className="text-xs text-muted-foreground">
              直近7日間の活動
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}