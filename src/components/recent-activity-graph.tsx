'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
        <CardHeader className="space-y-1 pb-2">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">最近のいいね活動</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          {activityData.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {activityData[0].date} ～ {activityData[activityData.length - 1].date}
            </p>
          )}
        </CardHeader>
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
            
            {/* 統計情報 */}
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
            
            <div className="flex items-center justify-center gap-2 text-sm">
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