'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ActivityData {
  date: string;
  count: number;
  dayName: string;
}

interface RecentActivityGraphProps {
  activityData: ActivityData[];
}

export function RecentActivityGraph({ activityData }: RecentActivityGraphProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [animatedHeights, setAnimatedHeights] = useState<number[]>([]);
  
  const maxCount = Math.max(...activityData.map(d => d.count));
  const totalCount = activityData.reduce((sum, d) => sum + d.count, 0);
  const average = Math.round(totalCount / activityData.length);
  
  // コンポーネントマウント時のアニメーション
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // バーの高さをアニメーション
  useEffect(() => {
    if (isVisible) {
      activityData.forEach((data, index) => {
        setTimeout(() => {
          setAnimatedHeights(prev => {
            const newHeights = [...prev];
            const height = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
            newHeights[index] = Math.max(height, 2);
            return newHeights;
          });
        }, index * 150);
      });
    }
  }, [isVisible, activityData, maxCount]);
  
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
            <div className="h-40 flex items-end justify-between gap-2 relative">
              {/* グリッドライン */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="border-t border-muted/20 w-full" />
                ))}
              </div>
              
              {activityData.map((data, index) => {
                const animatedHeight = animatedHeights[index] || 0;
                const isHighest = data.count === maxCount && maxCount > 0;
                
                return (
                  <div key={data.date} className="flex flex-col items-center flex-1 relative z-10">
                    {/* ホバー効果付きのバー */}
                    <div
                      className={`w-full rounded-t-md transition-all duration-700 ease-out cursor-pointer group relative ${
                        isHighest 
                          ? 'bg-gradient-to-t from-primary to-primary/80 shadow-lg' 
                          : 'bg-gradient-to-t from-primary/80 to-primary/60'
                      } hover:scale-105 hover:shadow-md`}
                      style={{ 
                        height: `${animatedHeight}%`,
                        minHeight: '4px',
                        transformOrigin: 'bottom'
                      }}
                      title={`${data.dayName}: ${data.count}個のいいね`}
                    >
                      {/* カウント表示 */}
                      {data.count > 0 && (
                        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium text-foreground opacity-0 group-hover:opacity-100 transition-opacity bg-popover border rounded px-1 py-0.5 shadow-sm whitespace-nowrap">
                          {data.count}
                        </div>
                      )}
                      
                      {/* 光る効果 */}
                      {isHighest && (
                        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 rounded-t-md animate-pulse" />
                      )}
                    </div>
                    
                    {/* 曜日ラベル */}
                    <div className={`text-xs mt-2 transition-all duration-500 ${
                      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                    }`} style={{ transitionDelay: `${index * 150 + 400}ms` }}>
                      <span className={`${data.count === maxCount && maxCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {data.dayName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* 統計情報 */}
            <div className={`grid grid-cols-2 gap-4 transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`} style={{ transitionDelay: '1000ms' }}>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {totalCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  合計いいね
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-muted-foreground">
                  {average}
                </div>
                <div className="text-xs text-muted-foreground">
                  平均/日
                </div>
              </div>
            </div>
            
            <div className={`flex items-center justify-center gap-2 text-sm transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`} style={{ transitionDelay: '1200ms' }}>
              {getTrendIcon()}
              <span className={`font-medium ${
                trend === 'up' ? 'text-green-600' : 
                trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
              }`}>
                {getTrendText()}
              </span>
              <span className="text-muted-foreground">・直近7日間</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}