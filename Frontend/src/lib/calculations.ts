interface DemandInput {
  itemCode: string;
  description: string;
  unit: string;
  categoryId: string | null;
  // Último snapshot de estoque
  currentStock: number;
  reservedQty: number;
  inProduction: number;
  inOrders: number;
  // Médias anuais
  avg2024: number;
  avg2025: number;
  avg2026: number;
}

export interface DemandResult extends DemandInput {
  categoryName: string;
  overallAvg: number;           // Média das médias anuais
  futureStockForecast: number;  // currentStock - reservedQty + inOrders
  estimatedDurationDays: number; // forecast / (overallAvg / 30)
  recommendedQty: number;       // MAX(0, (targetDays/30 * overallAvg) - MAX(0, forecast))
  urgency: 'critical' | 'warning' | 'ok'; // <30d, 30-60d, >60d
}

export function calculateDemand(input: DemandInput & { categoryName: string }, targetDays: number): DemandResult {
  const avgs = [input.avg2024, input.avg2025, input.avg2026].filter(v => v > 0);
  const overallAvg = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
  
  const futureStockForecast = input.currentStock - input.reservedQty + input.inOrders;
  
  const estimatedDurationDays = overallAvg > 0 
    ? Math.round((Math.max(0, futureStockForecast) / (overallAvg / 30))) 
    : 9999;
  
  const recommendedQty = overallAvg > 0
    ? Math.max(0, Math.round(((targetDays / 30) * overallAvg) - Math.max(0, futureStockForecast)))
    : 0;
  
  const urgency = estimatedDurationDays < 30 ? 'critical' 
    : estimatedDurationDays < 60 ? 'warning' : 'ok';

  return { ...input, overallAvg, futureStockForecast, estimatedDurationDays, recommendedQty, urgency };
}
