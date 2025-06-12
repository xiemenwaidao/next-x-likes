'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart3, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';

interface ActivityData {
  date: string;
  count: number;
  dayName: string;
}

interface RecentActivityGraphProps {
  activityData: ActivityData[];
}

const chartConfig = {
  count: {
    label: "いいね数",
    color: "hsl(var(--chart-1))",
  },
};

export function RecentActivityGraph({ activityData }: RecentActivityGraphProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const maxCount = Math.max(...activityData.map(d => d.count));
  const minCount = Math.min(...activityData.map(d => d.count));
  const totalCount = activityData.reduce((sum, d) => sum + d.count, 0);
  const average = Math.round(totalCount / activityData.length);
  
  // 標準偏差の計算
  const variance = activityData.reduce((sum, d) => sum + Math.pow(d.count - average, 2), 0) / activityData.length;
  const standardDeviation = Math.round(Math.sqrt(variance));
  
  // 傾向分析
  const firstHalf = activityData.slice(0, Math.ceil(activityData.length / 2));
  const secondHalf = activityData.slice(Math.ceil(activityData.length / 2));
  const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.count, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.count, 0) / secondHalf.length;
  
  // 変化率の計算
  const changeRate = firstHalfAvg > 0 ? Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;
  
  // より詳細な傾向判定
  let trend: 'sharp-up' | 'up' | 'stable' | 'down' | 'sharp-down';
  if (changeRate > 20) {
    trend = 'sharp-up';
  } else if (changeRate > 5) {
    trend = 'up';
  } else if (changeRate < -20) {
    trend = 'sharp-down';
  } else if (changeRate < -5) {
    trend = 'down';
  } else {
    trend = 'stable';
  }
  
  // 曜日別の分析
  const dayOfWeekStats: Record<string, number[]> = {};
  activityData.forEach(d => {
    if (!dayOfWeekStats[d.dayName]) {
      dayOfWeekStats[d.dayName] = [];
    }
    dayOfWeekStats[d.dayName].push(d.count);
  });
  
  const dayOfWeekAverages = Object.entries(dayOfWeekStats).map(([day, counts]) => ({
    day,
    average: Math.round(counts.reduce((sum, c) => sum + c, 0) / counts.length)
  }));
  
  const mostActiveDay = dayOfWeekAverages.reduce((max, curr) => 
    curr.average > max.average ? curr : max
  );
  
  const leastActiveDay = dayOfWeekAverages.reduce((min, curr) => 
    curr.average < min.average ? curr : min
  );
  
  // 連続性の分析
  let currentStreak = 0;
  let maxStreak = 0;
  activityData.forEach(d => {
    if (d.count > 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });
  
  const getTrendIcon = () => {
    switch (trend) {
      case 'sharp-up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'sharp-down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };
  
  const getTrendText = () => {
    switch (trend) {
      case 'sharp-up': return '急上昇';
      case 'up': return '上昇傾向';
      case 'sharp-down': return '急降下';
      case 'down': return '下降傾向';
      default: return '安定';
    }
  };

  return (
    <div className="w-full max-w-[28rem] mx-auto">
      <Card>
        <CardHeader className="space-y-1 pb-2">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">最近のいいね活動</CardTitle>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label={isExpanded ? "グラフを折りたたむ" : "グラフを展開する"}
            >
              <BarChart3 className="h-4 w-4" />
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
          {activityData.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {activityData[0].date} ～ {activityData[activityData.length - 1].date}
            </p>
          )}
        </CardHeader>
        {isExpanded && (
          <CardContent>
            <div className="space-y-4">
              {/* グラフ */}
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <BarChart
                  data={activityData}
                  margin={{ top: 20, right: 10, bottom: 20, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/20" vertical={false} />
                  <XAxis
                    dataKey="dayName"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    domain={[0, maxCount > 0 ? maxCount + Math.ceil(maxCount * 0.1) : 10]}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value, payload) => {
                          if (payload && payload[0]) {
                            const data = payload[0].payload;
                            return `${data.date} (${value})`;
                          }
                          return `${value}曜日`;
                        }}
                        formatter={(value) => [`${value}件`, '']}
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[4, 4, 0, 0]}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ChartContainer>
            
            {/* 基本統計情報 */}
            <div className="grid grid-cols-2 gap-4">
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
            
            {/* 詳細統計情報 */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-medium text-primary">{maxCount}</div>
                <div className="text-xs text-muted-foreground">最大</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">{minCount}</div>
                <div className="text-xs text-muted-foreground">最小</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">±{standardDeviation}</div>
                <div className="text-xs text-muted-foreground">標準偏差</div>
              </div>
            </div>
            
            {/* 傾向分析 */}
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm">
                {getTrendIcon()}
                <span className={`font-medium ${
                  trend === 'sharp-up' || trend === 'up' ? 'text-green-600' : 
                  trend === 'sharp-down' || trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
                }`}>
                  {getTrendText()}
                </span>
                {changeRate !== 0 && (
                  <span className={`text-xs ${
                    changeRate > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ({changeRate > 0 ? '+' : ''}{changeRate}%)
                  </span>
                )}
              </div>
              
              {/* 曜日別分析 */}
              {dayOfWeekAverages.length > 0 && (
                <div className="text-xs text-muted-foreground text-center space-y-1">
                  <div>
                    最も活発: <span className="font-medium text-primary">{mostActiveDay.day}曜日</span> (平均{mostActiveDay.average}件)
                  </div>
                  <div>
                    最も少ない: <span className="font-medium">{leastActiveDay.day}曜日</span> (平均{leastActiveDay.average}件)
                  </div>
                </div>
              )}
              
              {/* 連続性分析 */}
              {maxStreak > 1 && (
                <div className="text-xs text-muted-foreground text-center">
                  最大連続日数: <span className="font-medium text-primary">{maxStreak}日間</span>
                </div>
              )}
            </div>
          </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}