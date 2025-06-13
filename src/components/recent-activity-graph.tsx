'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart3, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

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
  const [showHelp, setShowHelp] = useState(false);
  
  const maxCount = Math.max(...activityData.map(d => d.count));
  const minCount = Math.min(...activityData.map(d => d.count));
  const totalCount = activityData.reduce((sum, d) => sum + d.count, 0);
  const average = Math.round(totalCount / activityData.length);
  
  // 標準偏差の計算
  const variance = activityData.reduce((sum, d) => sum + Math.pow(d.count - average, 2), 0) / activityData.length;
  const standardDeviation = Math.round(Math.sqrt(variance));
  
  // 傾向分析（週の前半・後半比較と移動平均を組み合わせた評価）
  let changeRate = 0;
  let trend: 'sharp-up' | 'up' | 'stable' | 'down' | 'sharp-down' = 'stable';
  
  // 7日間のデータがある場合は週次トレンドを評価
  if (activityData.length === 7) {
    // 前半3日と後半3日の平均を比較（中間の1日は両方に含める）
    const firstThree = activityData.slice(0, 3);
    const lastThree = activityData.slice(-3);
    const firstAvg = firstThree.reduce((sum, d) => sum + d.count, 0) / firstThree.length;
    const lastAvg = lastThree.reduce((sum, d) => sum + d.count, 0) / lastThree.length;
    
    // 変化率の計算
    changeRate = firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 100) : 0;
    
    // 外れ値の影響を軽減するため、中央値も考慮
    const sortedFirst = [...firstThree.map(d => d.count)].sort((a, b) => a - b);
    const sortedLast = [...lastThree.map(d => d.count)].sort((a, b) => a - b);
    const firstMedian = sortedFirst[1]; // 3つの中央値
    const lastMedian = sortedLast[1];
    const medianChangeRate = firstMedian > 0 ? Math.round(((lastMedian - firstMedian) / firstMedian) * 100) : 0;
    
    // 平均と中央値の変化率を総合的に評価
    const combinedChangeRate = (changeRate + medianChangeRate) / 2;
    
    // 実際の件数差も考慮した傾向判定
    const actualDiff = Math.abs(lastAvg - firstAvg);
    
    // 件数差が5件未満、または変化率が±10%以内なら安定
    if (actualDiff < 5 || Math.abs(combinedChangeRate) <= 10) {
      trend = 'stable';
    } 
    // 件数差が10件以上、かつ変化率が±50%以上なら急変
    else if (actualDiff >= 10 && combinedChangeRate > 50) {
      trend = 'sharp-up';
    } else if (actualDiff >= 10 && combinedChangeRate < -50) {
      trend = 'sharp-down';
    }
    // それ以外は通常の上昇/下降
    else if (combinedChangeRate > 10) {
      trend = 'up';
    } else if (combinedChangeRate < -10) {
      trend = 'down';
    }
    
    // 表示用の変化率は平均ベースのものを使用
    changeRate = Math.round(combinedChangeRate);
  } else {
    // 7日未満の場合は、最初と最後の期間を比較
    const midPoint = Math.floor(activityData.length / 2);
    const firstHalf = activityData.slice(0, midPoint);
    const secondHalf = activityData.slice(midPoint);
    
    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstAvg = firstHalf.reduce((sum, d) => sum + d.count, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, d) => sum + d.count, 0) / secondHalf.length;
      changeRate = firstAvg > 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;
      
      // より穏やかな判定基準
      if (Math.abs(changeRate) <= 15) {
        trend = 'stable';
      } else if (changeRate > 40) {
        trend = 'sharp-up';
      } else if (changeRate > 15) {
        trend = 'up';
      } else if (changeRate < -40) {
        trend = 'sharp-down';
      } else if (changeRate < -15) {
        trend = 'down';
      }
    }
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
                {trend !== 'stable' && changeRate !== 0 && (
                  <span className={`text-xs ${
                    changeRate > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ({changeRate > 0 ? '+' : ''}{changeRate}%)
                  </span>
                )}
                <button
                  onClick={() => setShowHelp(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="傾向分析の説明を表示"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
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
      
      {/* ヘルプダイアログ */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>傾向分析の計算方法</DialogTitle>
            <DialogDescription>
              いいね活動の傾向を判定する仕組みについて説明します
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold">📊 基本的な考え方</h3>
              <p className="text-muted-foreground">
                7日間のデータがある場合、週の前半3日と後半3日の平均を比較して傾向を判定します。
                これにより、週単位での活動の変化を把握できます。
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold">🧮 計算方法</h3>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                <li>前半3日間の平均いいね数を計算</li>
                <li>後半3日間の平均いいね数を計算</li>
                <li>変化率 = (後半平均 - 前半平均) ÷ 前半平均 × 100</li>
                <li>外れ値の影響を軽減するため、中央値での変化率も計算</li>
                <li>両方の変化率を平均して最終的な変化率を決定</li>
              </ol>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold">📈 傾向の判定基準</h3>
              <div className="space-y-2 text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-primary">安定:</span>
                  <div>
                    <p>実際の件数差が5件未満、または変化率が±10%以内</p>
                    <p className="text-xs">例: 前半10件/日 → 後半12件/日（差2件）</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500">上昇:</span>
                  <div>
                    <p>変化率が+10%を超える</p>
                    <p className="text-xs">例: 前半10件/日 → 後半15件/日（+50%）</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-500">下降:</span>
                  <div>
                    <p>変化率が-10%を下回る</p>
                    <p className="text-xs">例: 前半15件/日 → 後半10件/日（-33%）</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600">急上昇:</span>
                  <div>
                    <p>件数差が10件以上、かつ変化率が+50%を超える</p>
                    <p className="text-xs">例: 前半5件/日 → 後半20件/日（差15件、+300%）</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-600">急降下:</span>
                  <div>
                    <p>件数差が10件以上、かつ変化率が-50%を下回る</p>
                    <p className="text-xs">例: 前半20件/日 → 後半5件/日（差15件、-75%）</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold">💡 なぜこの方法？</h3>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>実際の件数差を考慮することで、小さな変動を過大評価しない</li>
                <li>中央値を使うことで、1日だけ極端に多い/少ない日の影響を軽減</li>
                <li>週単位の比較により、最近の傾向をより正確に把握</li>
              </ul>
            </div>
            
            {activityData.length === 7 && (
              <div className="space-y-2 border-t pt-4">
                <h3 className="font-semibold">📋 現在のデータでの計算例</h3>
                <div className="space-y-1 text-muted-foreground">
                  <p>前半3日: {activityData.slice(0, 3).map(d => `${d.count}件`).join('、')} → 平均{(activityData.slice(0, 3).reduce((sum, d) => sum + d.count, 0) / 3).toFixed(1)}件</p>
                  <p>後半3日: {activityData.slice(-3).map(d => `${d.count}件`).join('、')} → 平均{(activityData.slice(-3).reduce((sum, d) => sum + d.count, 0) / 3).toFixed(1)}件</p>
                  <p>変化率: {changeRate}%</p>
                  <p>判定: {getTrendText()}</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}