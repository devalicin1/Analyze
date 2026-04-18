import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SeriesConfig = {
  dataKey: string
  label: string
  color: string
  yAxisId?: 'left' | 'right'
}

type LineChartProps<T extends Record<string, unknown>> = {
  data: T[]
  xKey: keyof T
  series: SeriesConfig[]
  height?: number
  formatter?: (value: number) => string
  dualAxis?: boolean
}

export function LineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 320,
  formatter,
  dualAxis = false,
}: LineChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: dualAxis ? 10 : 5, bottom: 5, left: 5 }}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" />
        <XAxis
          dataKey={xKey as string}
          tick={{ fontSize: 12, fill: '#667085' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 12, fill: '#667085' }}
          tickLine={false}
          axisLine={false}
        />
        {dualAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: '#667085' }}
            tickLine={false}
            axisLine={false}
          />
        )}
        <Tooltip
          formatter={(value: number, name: string) => {
            const seriesItem = series.find(s => s.dataKey === name || s.label === name)
            if (formatter && (!dualAxis || seriesItem?.yAxisId !== 'right')) {
              return formatter(value)
            }
            return value.toLocaleString()
          }}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            yAxisId={dualAxis ? (s.yAxisId || 'left') : 'left'}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
